import type { SupabaseClient, User } from '@supabase/supabase-js'

import {
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  normalizeInvoiceAnalysisFilters,
  type InvoiceAnalysisSummary,
} from '@/lib/premium-analysis/analysis-summary'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { enrichSummaryWithAgentsOutputs } from '@/lib/premium-analysis/agents-outputs'
import { buildSpendShipmentPeriodMatrix } from '@/lib/premium-analysis/period-averages-matrix'
import { buildIngestDiagnostics, mergeParseVersions } from '@/lib/premium-analysis/ingest-diagnostics'
import {
  applyIngestQualityGate,
  evaluateIngestQuality,
} from '@/lib/premium-analysis/ingest-quality'
import { loadPremiumIngestRecords } from '@/lib/premium-analysis/ingest-adapters'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'

export type PremiumAnalysisComputeResult = {
  summaryCore: InvoiceAnalysisSummary
  /** Same object the dashboard persists: core + filterMeta + appliedFilters */
  summaryForDashboard: InvoiceAnalysisSummary & {
    filterMeta: ReturnType<typeof buildInvoiceAnalysisFilterMeta>
    appliedFilters: ReturnType<typeof normalizeInvoiceAnalysisFilters>
  }
  /** Filtered rows used for `summaryCore` (for Excel detail export). */
  records: InvoiceRecord[]
  mappingByDescription: ReturnType<typeof buildChargeDescriptionLookup>
  /** Distinct source files ingested across all carrier adapters. */
  uploadsCount: number
  /** UPS CSV rows tagged with source upload id — for invoice_rows sync on unfiltered analyze. */
  upsSyncTagged: UpsRowSyncInput[]
}

/**
 * Loads charge lines from `invoice_rows` (default, S6) with optional legacy rollback.
 * Adapter registry (deprecated): `lib/premium-analysis/ingest-adapters/index.ts`
 */
export async function computePremiumInvoiceAnalysis(
  supabase: SupabaseClient,
  user: User,
  filtersRaw: unknown | undefined
): Promise<
  | { ok: true; data: PremiumAnalysisComputeResult }
  | { ok: false; status: number; message: string }
> {
  const appliedFilters = normalizeInvoiceAnalysisFilters(filtersRaw)

  const { data: mappings, error: mappingsError } = await supabase.from('master_mapping').select(
    'carrier, standardized_charge, charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
  )

  if (mappingsError) return { ok: false, status: 400, message: mappingsError.message }

  let merged
  try {
    merged = await loadPremiumIngestRecords(supabase, user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load invoice data'
    return { ok: false, status: 400, message }
  }

  if (merged.records.length === 0) {
    return {
      ok: false,
      status: 404,
      message:
        'No invoice data found. Upload FedEx, WWE, or UPS invoice files on this page, then click Refresh analysis.',
    }
  }

  const filterMeta = buildInvoiceAnalysisFilterMeta(merged.records)
  const records = filterInvoiceRecords(merged.records, appliedFilters)
  const mappingByDescription = buildChargeDescriptionLookup(mappings ?? [])
  const ingestDiagnostics = buildIngestDiagnostics(
    merged.records,
    merged.diagnostics,
    mappingByDescription,
    mergeParseVersions(merged.diagnostics.parseVersions)
  )
  const summaryBase = computeInvoiceAnalysisSummary(records, mappingByDescription)
  const periodMatrix = buildSpendShipmentPeriodMatrix(records)
  const ingestQuality = evaluateIngestQuality(ingestDiagnostics, summaryBase.measures.totalCost)
  const contractDiscounts = await loadUserContractDiscounts(supabase, user)
  const summaryCore = applyIngestQualityGate(
    enrichSummaryWithAgentsOutputs(summaryBase, records, mappings ?? [], contractDiscounts),
    ingestQuality
  )
  const summaryForDashboard = {
    ...summaryCore,
    periodMatrix,
    filterMeta,
    appliedFilters,
    ingestDiagnostics,
    ingestQuality,
    ingestSource: merged.ingestSource,
  }

  return {
    ok: true,
    data: {
      summaryCore,
      summaryForDashboard,
      records,
      mappingByDescription,
      uploadsCount: merged.sourceCount,
      upsSyncTagged: merged.upsSyncTagged,
    },
  }
}
