import {
  buildChargeDescriptionLookup,
  parseInvoiceDateKey,
  shipmentPackageDedupeKey,
  type ChargeDescriptionMappingRow,
  type InvoiceAnalysisSummary,
} from '@/lib/premium-analysis/analysis-summary'
import { primaryRollupDateRaw } from '@/lib/invoices/csv'
import type { AnomalyFlag, DatasetFlags } from '@/lib/premium-analysis/agents-types'
import { resolveAgentsCategory, rollupByAgentsCategory } from '@/lib/premium-analysis/spec-categories'
import { isAvoidableExpedited } from '@/lib/premium-analysis/transit-table'
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

function serviceFromRecord(rec: InvoiceRecord): string {
  return (
    (rec['Original Service Description'] ?? '').trim() ||
    (rec['Charge Category Code'] ?? '').trim() ||
    'Unknown'
  )
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
  mappingRows: ChargeDescriptionMappingRow[] | null | undefined
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
      amount: summary.measures.weightGap,
      description: 'Total billed weight exceeds declared weight by more than 500 lbs — review DIM packaging',
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

  const transportByShipment = new Map<string, number>()
  const fuelByShipment = new Map<string, { fuel: number; service: string; shipDate: string; tracking: string; invoice: string }>()

  for (const rec of records) {
    const cat = resolveAgentsCategory(rec, mappingLookup, stdLookup, mappingRows)
    const net = toNumber(rec['Net Amount'])
    const tracking = trackingFromRecord(rec)
    const invoiceNumber = (rec['Invoice Number'] ?? '').trim() || null
    const shipKey = shipmentPackageDedupeKey(rec)
    const service = serviceFromRecord(rec)
    const zone = toNumber(rec['Zone'])

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

    if (isAvoidableExpedited(zone, service) && net > 0) {
      flags.push({
        type: 'avoidable_expedited',
        trackingNumber: tracking,
        invoiceNumber,
        amount: net,
        description: `Expedited service (${service}) in zone ${zone} where Ground transit is ≤3 days`,
        severity: 'medium',
      })
    }

    if (shipKey) {
      if (cat === 'BASE_FREIGHT') {
        transportByShipment.set(shipKey, (transportByShipment.get(shipKey) ?? 0) + net)
      }
      if (cat === 'FUEL') {
        const shipDate = parseInvoiceDateKey(primaryRollupDateRaw(rec)) ?? ''
        const existing = fuelByShipment.get(shipKey)
        if (!existing) {
          fuelByShipment.set(shipKey, {
            fuel: net,
            service,
            shipDate,
            tracking: tracking ?? '',
            invoice: invoiceNumber ?? '',
          })
        } else {
          existing.fuel += net
        }
      }
    }
  }

  for (const [shipKey, fuelInfo] of fuelByShipment) {
    const transport = transportByShipment.get(shipKey) ?? 0
    if (transport <= 0 || !fuelInfo.shipDate) continue
    const rerate = rerateFuelRow({
      tracking_number: fuelInfo.tracking,
      ship_date: fuelInfo.shipDate,
      service: fuelInfo.service,
      transport_charge: transport,
      billed_fuel_surcharge: fuelInfo.fuel,
    })
    if (rerate.flag === 'overbilled' && rerate.variance != null && rerate.variance > 0) {
      const ratePp =
        rerate.rate_used != null && transport > 0
          ? ((fuelInfo.fuel / transport - rerate.rate_used) * 100)
          : 0
      if (ratePp > 0.5) {
        flags.push({
          type: 'fuel_over_eia',
          trackingNumber: fuelInfo.tracking || null,
          invoiceNumber: fuelInfo.invoice || null,
          amount: rerate.variance,
          description: `Fuel surcharge over published EIA rate by ${ratePp.toFixed(2)}pp`,
          severity: 'high',
        })
      }
    }
  }

  return flags.sort((a, b) => b.amount - a.amount)
}
