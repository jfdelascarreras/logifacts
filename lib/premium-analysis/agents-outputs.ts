import {
  buildChargeDescriptionLookup,
  shipmentPackageDedupeKey,
  type ChargeDescriptionMappingRow,
  type InvoiceAnalysisSummary,
} from '@/lib/premium-analysis/analysis-summary'
import type { AgentsAnalysisExtensions } from '@/lib/premium-analysis/agents-types'
import { detectAnomalies, buildDatasetFlags } from '@/lib/premium-analysis/anomaly-detection'
import { prioritizeActions } from '@/lib/premium-analysis/action-prioritization'
import { buildCarrierMix } from '@/lib/premium-analysis/carrier-mix'
import {
  buildShipmentFacts,
  shipmentWeightGapLbs,
} from '@/lib/premium-analysis/shipment-fact'
import {
  detectContractDiscountShortfalls,
  type ContractDiscounts,
} from '@/lib/premium-analysis/contract-compliance'
import { estimateSavings } from '@/lib/premium-analysis/savings-estimator'
import { rollupByAgentsCategory } from '@/lib/premium-analysis/spec-categories'
import type { InvoiceRecord } from '@/lib/invoices/csv'

export function enrichSummaryWithAgentsOutputs(
  summary: InvoiceAnalysisSummary,
  records: InvoiceRecord[],
  mappingRows: ChargeDescriptionMappingRow[] | null | undefined,
  contractDiscounts: ContractDiscounts = {}
): InvoiceAnalysisSummary & AgentsAnalysisExtensions {
  const mappingLookup = buildChargeDescriptionLookup(mappingRows)
  const shipmentFacts = buildShipmentFacts(records, mappingLookup, mappingRows)
  const specCategories = rollupByAgentsCategory(records, mappingLookup, mappingRows)
  const baseFreight = specCategories.categories.find((c) => c.category === 'BASE_FREIGHT')?.totalCost ?? 0

  const measures = {
    ...summary.measures,
    baseFreightCost: baseFreight,
    accessorialRate: baseFreight > 0 ? (summary.measures.costAccessorials ?? 0) / baseFreight : 0,
    weightGap: shipmentWeightGapLbs(shipmentFacts),
  }

  const shipmentCountsByCarrier = countShipmentsByDimension(records, 'carrier')
  const shipmentCountsByService = countShipmentsByDimension(records, 'service')

  const byCarrier = Object.fromEntries(
    Object.entries(summary.byCarrier).map(([k, v]) => [
      k,
      { ...v, shipmentCount: shipmentCountsByCarrier.get(k) ?? 0 },
    ])
  )
  const byService = Object.fromEntries(
    Object.entries(summary.byService).map(([k, v]) => [
      k,
      { ...v, shipmentCount: shipmentCountsByService.get(k) ?? 0 },
    ])
  )

  const enrichedBase: InvoiceAnalysisSummary = {
    ...summary,
    measures,
    byCarrier,
    byService,
  }

  const datasetFlags = buildDatasetFlags(enrichedBase, records, mappingLookup, mappingRows)
  let anomalyFlags = detectAnomalies(records, enrichedBase, mappingLookup, mappingRows, shipmentFacts)

  const contractFlags = detectContractDiscountShortfalls(records, contractDiscounts)
  anomalyFlags = [...anomalyFlags, ...contractFlags].sort((a, b) => b.amount - a.amount)

  const savingsEstimate = estimateSavings(
    anomalyFlags,
    summary.monthlySpend,
    summary.measures.totalCost
  )
  const actionItems = prioritizeActions(savingsEstimate)

  return {
    ...enrichedBase,
    specCategories,
    carrierMix: buildCarrierMix(shipmentFacts),
    anomalyFlags,
    savingsEstimate,
    actionItems,
    datasetFlags,
  }
}

function countShipmentsByDimension(
  records: InvoiceRecord[],
  dim: 'carrier' | 'service'
): Map<string, number> {
  const sets = new Map<string, Set<string>>()

  for (const rec of records) {
    const key =
      dim === 'carrier'
        ? (rec['Carrier Name'] ?? '').trim() || 'Unknown'
        : (rec['Original Service Description'] ?? '').trim() ||
          (rec['Charge Category Code'] ?? '').trim() ||
          'Unknown'
    const shipKey = shipmentPackageDedupeKey(rec)
    if (!shipKey) continue
    const bucket = sets.get(key) ?? new Set<string>()
    bucket.add(shipKey)
    sets.set(key, bucket)
  }

  return new Map([...sets.entries()].map(([k, v]) => [k, v.size]))
}
