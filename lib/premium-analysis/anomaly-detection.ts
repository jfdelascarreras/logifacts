import {
  buildChargeDescriptionLookup,
  type ChargeDescriptionMappingRow,
  type InvoiceAnalysisSummary,
} from '@/lib/premium-analysis/analysis-summary'
import type { AnomalyFlag, DatasetFlags } from '@/lib/premium-analysis/agents-types'
import { resolveAgentsCategory, rollupByAgentsCategory } from '@/lib/premium-analysis/spec-categories'
import { buildShipmentFacts } from '@/lib/premium-analysis/shipment-fact'
import { isAvoidableExpedited } from '@/lib/premium-analysis/transit-table'
import { marginalAvoidablePremium } from '@/lib/premium-analysis/expedited-marginal'
import { detectMonthlySpendSpikes } from '@/lib/premium-analysis/trend-flags'
import { rerateFuelRow } from '@/lib/pricing/fuel-rerate'
import { toNumber, type InvoiceRecord } from '@/lib/invoices/csv'

function trackingFromRecord(rec: InvoiceRecord): string | null {
  const t = (rec['Tracking Number'] ?? '').trim()
  if (t) return t
  const ref = (rec['Shipment Reference Number 1'] ?? '').trim()
  if (ref) return ref
  return (rec['Lead Shipment Number'] ?? '').trim() || null
}

export function buildDatasetFlags(
  summary: InvoiceAnalysisSummary,
  records: InvoiceRecord[],
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  mappingRows: ChargeDescriptionMappingRow[] | null | undefined
): DatasetFlags {
  const baseFreight =
    rollupByAgentsCategory(records, mappingLookup, mappingRows).categories.find(
      (c) => c.category === 'BASE_FREIGHT'
    )?.totalCost ?? 0
  const accessorialRate =
    baseFreight > 0 ? (summary.measures.costAccessorials ?? 0) / baseFreight : 0

  const wwePresent = records.some((r) => /wwe|world/i.test(r['Carrier Name'] ?? ''))

  return {
    weightGapExceeds500Lbs: summary.measures.weightGap > 500,
    accessorialRateHigh: accessorialRate > 0.1,
    accessorialRate,
    monthlySpikeMonths: detectMonthlySpendSpikes(summary.monthlySpend),
    wweFuelEmbedded: wwePresent,
    wwePresent,
  }
}

export function detectAnomalies(
  records: InvoiceRecord[],
  summary: InvoiceAnalysisSummary,
  mappingLookup: ReturnType<typeof buildChargeDescriptionLookup>,
  mappingRows: ChargeDescriptionMappingRow[] | null | undefined,
  shipmentFacts?: ReturnType<typeof buildShipmentFacts>
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = []
  const datasetFlags = buildDatasetFlags(summary, records, mappingLookup, mappingRows)
  const stdLookup = new Map<string, string | null>()

  if (datasetFlags.accessorialRateHigh) {
    flags.push({
      type: 'accessorial_rate_high',
      trackingNumber: null,
      invoiceNumber: null,
      amount: summary.measures.costAccessorials ?? 0,
      description: `Accessorial rate ${(datasetFlags.accessorialRate * 100).toFixed(1)}% exceeds 10% benchmark`,
      severity: 'high',
    })
  }

  if (datasetFlags.weightGapExceeds500Lbs) {
    flags.push({
      type: 'weight_gap_high',
      trackingNumber: null,
      invoiceNumber: null,
      amount: 0,
      description: `Total billed weight exceeds declared weight by ${summary.measures.weightGap.toFixed(0)} lbs — review DIM packaging`,
      severity: 'medium',
    })
  }

  for (const month of datasetFlags.monthlySpikeMonths) {
    const row = summary.monthlySpend.find((m) => m.month === month)
    flags.push({
      type: 'monthly_spend_spike',
      trackingNumber: null,
      invoiceNumber: null,
      amount: row?.totalCost ?? 0,
      description: `${month} spend is more than 20% above the prior 3-month rolling average`,
      severity: 'medium',
    })
  }

  for (const rec of records) {
    const cat = resolveAgentsCategory(rec, mappingLookup, stdLookup, mappingRows)
    const net = toNumber(rec['Net Amount'])
    const tracking = trackingFromRecord(rec)
    const invoiceNumber = (rec['Invoice Number'] ?? '').trim() || null

    if (cat === 'ADDRESS_CORRECTION' && net > 0) {
      flags.push({
        type: 'address_correction',
        trackingNumber: tracking,
        invoiceNumber,
        amount: net,
        description: 'Address correction charge — enable validation at checkout',
        severity: 'medium',
      })
    }

    if (cat === 'ADD_HANDLING' && net > 0) {
      flags.push({
        type: 'additional_handling',
        trackingNumber: tracking,
        invoiceNumber,
        amount: net,
        description: 'Additional handling charge — review packaging dimensions/weight',
        severity: 'medium',
      })
    }

    if (cat === 'LARGE_PACKAGE' && net > 100) {
      flags.push({
        type: 'large_package',
        trackingNumber: tracking,
        invoiceNumber,
        amount: net,
        description: 'Large package surcharge exceeds $100 on one shipment',
        severity: 'high',
      })
    }

    if (cat === 'DECLARED_VALUE' && net > 0) {
      flags.push({
        type: 'declared_value',
        trackingNumber: tracking,
        invoiceNumber,
        amount: net,
        description: 'Declared value charge — verify liability coverage need',
        severity: 'low',
      })
    }
  }

  const facts =
    shipmentFacts ?? buildShipmentFacts(records, mappingLookup, mappingRows)

  for (const fact of facts) {
    const zone = fact.zone
    if (zone == null || !fact.service) continue
    if (!isAvoidableExpedited(zone, fact.service, fact.carrier)) continue
    if (fact.baseFreightNet <= 0) continue

    const marginal =
      marginalAvoidablePremium({
        carrier: fact.carrier,
        service: fact.service,
        zone,
        weightLbs: Math.max(fact.billedWeight, fact.enteredWeight, 1),
        baseFreightNet: fact.baseFreightNet,
      }) ?? fact.baseFreightNet

    const amount = Math.max(0, Math.min(marginal, fact.shipmentNet))
    if (amount <= 0) continue

    flags.push({
      type: 'avoidable_expedited',
      trackingNumber: fact.tracking,
      invoiceNumber: fact.invoiceNumber,
      amount,
      description: `Expedited service (${fact.service}) in zone ${zone} where Ground transit is ≤3 days`,
      severity: 'medium',
    })
  }

  for (const fact of facts) {
    if (fact.baseFreightNet <= 0 || !fact.shipDate || fact.fuelNet <= 0) continue
    const rerate = rerateFuelRow({
      tracking_number: fact.tracking ?? '',
      ship_date: fact.shipDate,
      service: fact.service,
      transport_charge: fact.baseFreightNet,
      billed_fuel_surcharge: fact.fuelNet,
    })
    if (rerate.flag === 'overbilled' && rerate.variance != null && rerate.variance > 0) {
      const ratePp =
        rerate.rate_used != null && fact.baseFreightNet > 0
          ? ((fact.fuelNet / fact.baseFreightNet - rerate.rate_used) * 100)
          : 0
      if (ratePp > 0.5) {
        flags.push({
          type: 'fuel_over_eia',
          trackingNumber: fact.tracking,
          invoiceNumber: fact.invoiceNumber,
          amount: rerate.variance,
          description: `Fuel surcharge over published EIA rate by ${ratePp.toFixed(2)}pp`,
          severity: 'high',
        })
      }
    }
  }

  return flags.sort((a, b) => b.amount - a.amount)
}

/** Dollar-denominated flags only (excludes informational zero-amount flags). */
export function sumDollarFlagAmounts(flags: AnomalyFlag[]): number {
  return flags.reduce((sum, f) => sum + f.amount, 0)
}
