import type { SupabaseClient, User } from '@supabase/supabase-js'

import {
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  normalizeInvoiceAnalysisFilters,
  type InvoiceAnalysisSummary,
} from '@/lib/invoices/analysis-summary'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import { loadPremiumIngestRecords } from '@/lib/invoices/ingest-adapters'
import { buildSpendShipmentPeriodMatrix } from '@/lib/invoices/period-averages-matrix'
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
 * Loads all invoices for the user across carriers via per-carrier ingest adapters,
 * merges charge lines, applies optional dashboard filters, and returns a unified summary.
 *
 * Adapter registry: `lib/invoices/ingest-adapters/index.ts`
 *   • UPS  → `invoice_uploads` (CSV) or `invoices`/`invoice_lines` (multipart fallback)
 *   • FedEx / WWE → `invoices` + `invoice_lines` (multipart)
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
    return { ok: false, status: 404, message: 'No invoice uploads found' }
  }

  const filterMeta = buildInvoiceAnalysisFilterMeta(merged.records)
  const records = filterInvoiceRecords(merged.records, appliedFilters)
  const mappingByDescription = buildChargeDescriptionLookup(mappings ?? [])
  const summaryCore = computeInvoiceAnalysisSummary(records, mappingByDescription)
  const periodMatrix = buildSpendShipmentPeriodMatrix(records)
  const summaryForDashboard = {
    ...summaryCore,
    periodMatrix,
    filterMeta,
    appliedFilters,
    ingestDiagnostics: merged.diagnostics,
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
