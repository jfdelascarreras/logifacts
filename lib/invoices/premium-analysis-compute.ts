import type { SupabaseClient, User } from '@supabase/supabase-js'

import {
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  normalizeInvoiceAnalysisFilters,
  type InvoiceAnalysisSummary,
} from '@/lib/invoices/analysis-summary'
import {
  applyProfileSenderCompanyName,
  filterRowsLikeClubColorsPowerQuery,
  parseInvoiceCsvDocument,
  type InvoiceRecord,
} from '@/lib/invoices/csv'
import {
  dedupeInvoiceRecordsStableOrder,
  dedupeInvoiceUploadRowsBySha256,
} from '@/lib/invoices/identifier-safety'
import {
  analyzeParseCacheFingerprint,
  analyzeParseCacheKey,
  getAnalyzeParseCache,
  setAnalyzeParseCache,
  type PremiumParseIngestDiagnostics,
} from '@/lib/invoices/analyze-parse-cache'
import { contentSha256FromStoredCsv } from '@/lib/invoices/dedupe-hash-server'

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
  /** Distinct uploads by content_sha256 (newest-first list with duplicates skipped). */
  /** Distinct uploads used after hashing identical files once (duplicate files skipped before parse). */
  uploadsCount: number
}

/**
 * Loads all invoice CSV uploads for the user, applies Club Colors filtering, optional dashboard filters,
 * and returns the same summary shape as POST /api/invoices/analyze (without DB side effects).
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

  const [{ data: uploads, error: uploadError }, { data: mappings, error: mappingsError }] = await Promise.all([
    supabase
      .from('invoice_uploads')
      .select('id, csv_text, created_at, content_sha256')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    /*
     * TODO (`standardized_charge` — cross-carrier grouping + dashboard filters)
     *
     * This query already returns **`standardized_charge`** from **`master_mapping`** (canonical taxonomy, same grain as
     * multipart ingest). That column maps vendor-specific **`charge_description`** text to finance’s **shared label**
     * for multicarrier rollups (`standardized_charge` is the normalization key analysts expect when stacking FedEx /
     * UPS / WWE buckets).
     *
     * It is **not yet** consumed downstream: **`buildChargeDescriptionLookup`** trims it off before **`ChargeTaxonomyValue`**,
     * so **`computeInvoiceAnalysisSummary`** and the dashboard cannot filter or group by standardized label. When
     * promoting it: thread the field through the lookup payload and summary engine (see **`buildChargeDescriptionLookup`**
     * TODO in **`analysis-summary.ts`**), regenerate filter metadata distincts, persist any new slices on saved analysis JSON,
     * and ship UI filters + charts keyed by **`standardized_charge`** alongside existing carrier/category breakdowns.
     */
    /* Canonical taxonomy — same rows used by multipart ingest (`mapInvoiceLines`). */
    supabase.from('master_mapping').select(
      'carrier, standardized_charge, charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
    ),
  ])

  if (uploadError) {
    return { ok: false, status: 400, message: uploadError.message }
  }

  if (!uploads || uploads.length === 0) {
    return { ok: false, status: 404, message: 'No invoice uploads found' }
  }

  const uploadsMissingHash = uploads.filter((u) => !u.content_sha256 || String(u.content_sha256).length === 0)
  for (const u of uploadsMissingHash) {
    const csvText = String(u.csv_text ?? '')
    const content_sha256 = contentSha256FromStoredCsv(csvText)
    const { error: hashErr } = await supabase.from('invoice_uploads').update({ content_sha256 }).eq('id', u.id)
    if (hashErr) {
      return { ok: false, status: 400, message: hashErr.message }
    }
    u.content_sha256 = content_sha256
  }

  const { uploadsDeduped, duplicateUploadRowsSkipped } = dedupeInvoiceUploadRowsBySha256(uploads)

  const profileCompanyName = String(user.user_metadata?.company_name ?? '').trim()

  const parseCacheKey = analyzeParseCacheKey(user.id, analyzeParseCacheFingerprint(uploadsDeduped))
  const cached = getAnalyzeParseCache(parseCacheKey, profileCompanyName)
  let fullRecords: InvoiceRecord[]
  let ingestDiagnostics: PremiumParseIngestDiagnostics

  if (cached) {
    fullRecords = cached.fullRecords
    ingestDiagnostics = cached.ingestDiagnostics
  } else {
    let rowsDroppedCriticalSciCorruption = 0
    const merged = uploadsDeduped.flatMap((upload) => {
      const doc = parseInvoiceCsvDocument(String(upload.csv_text ?? ''))
      rowsDroppedCriticalSciCorruption += doc.rowsDroppedCriticalSciCorruption
      return doc.records
    })
    const afterFilter = filterRowsLikeClubColorsPowerQuery(merged)
    const { records: uniqCharges, duplicatesDropped: duplicateChargeRowsDropped } =
      dedupeInvoiceRecordsStableOrder(afterFilter)
    fullRecords = applyProfileSenderCompanyName(uniqCharges, profileCompanyName)
    ingestDiagnostics = {
      duplicateUploadRowsSkipped,
      duplicateChargeRowsDropped,
      rowsDroppedCriticalSciCorruption,
    }
    setAnalyzeParseCache(parseCacheKey, profileCompanyName, fullRecords, ingestDiagnostics)
  }

  const filterMeta = buildInvoiceAnalysisFilterMeta(fullRecords)
  const records = filterInvoiceRecords(fullRecords, appliedFilters)

  if (mappingsError) {
    return { ok: false, status: 400, message: mappingsError.message }
  }

  const mappingByDescription = buildChargeDescriptionLookup(mappings ?? [])
  const summaryCore = computeInvoiceAnalysisSummary(records, mappingByDescription)
  const summaryForDashboard = {
    ...summaryCore,
    filterMeta,
    appliedFilters,
    ingestDiagnostics,
  }

  return {
    ok: true,
    data: {
      summaryCore,
      summaryForDashboard,
      records,
      mappingByDescription,
      uploadsCount: uploadsDeduped.length,
    },
  }
}
