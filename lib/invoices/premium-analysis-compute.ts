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
  INVOICE_HEADERS,
  applyProfileSenderCompanyName,
  filterRowsLikeClubColorsPowerQuery,
  parseInvoiceCsvDocument,
  type InvoiceRecord,
} from '@/lib/invoices/csv'
import {
  dedupeInvoiceUploadRowsBySha256,
  dedupeTaggedInvoiceRecordsStableOrder,
} from '@/lib/invoices/identifier-safety'
import {
  analyzeParseCacheFingerprint,
  analyzeParseCacheKey,
  getAnalyzeParseCache,
  setAnalyzeParseCache,
  type PremiumParseIngestDiagnostics,
} from '@/lib/invoices/analyze-parse-cache'
import { contentSha256FromStoredCsv } from '@/lib/invoices/dedupe-hash-server'
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
  /** Distinct uploads used after hashing identical files once (duplicate files skipped before parse). */
  uploadsCount: number
  /** UPS rows tagged with source upload id — for invoice_rows sync on unfiltered analyze. */
  upsSyncTagged: UpsRowSyncInput[]
}

// -- Helper: convert invoice_lines rows into InvoiceRecord shape ---------------

type RawInvoiceLine = {
  invoice_id: string
  charge_description: string
  charge_amount: number
  zone: string | null
  destination_state: string | null
  shipment_date: string | null
  charge_classification_code: string | null
  charge_category_code: string | null
  package_quantity: number | null
}

type RawInvoiceMeta = {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  carrier: string
}

/**
 * Convert FedEx/WWE invoice_lines rows to the InvoiceRecord shape that
 * computeInvoiceAnalysisSummary consumes. Unknown fields are left null.
 */
function invoiceLinesAsInvoiceRecords(
  lines: RawInvoiceLine[],
  invoices: RawInvoiceMeta[]
): InvoiceRecord[] {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]))
  const emptyRow = (): InvoiceRecord =>
    Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord

  return lines.map((line) => {
    const inv = invoiceMap.get(line.invoice_id)
    const r = emptyRow()
    r['Charge Description'] = line.charge_description
    // Both Net Amount and Invoice Amount map to the line's charge amount.
    r['Net Amount'] = String(line.charge_amount)
    r['Invoice Amount'] = String(line.charge_amount)
    r['Invoice Number'] = inv?.invoice_number ?? ''
    r['Invoice Date'] = inv?.invoice_date ?? ''
    // 'Carrier Name' drives byCarrier bucketing and taxonomy lookup.
    r['Carrier Name'] = inv?.carrier ?? 'Unknown'
    r['Zone'] = line.zone ?? ''
    r['Receiver State'] = line.destination_state ?? ''
    r['Shipment Date'] = line.shipment_date ?? ''
    r['Charge Classification Code'] = line.charge_classification_code ?? ''
    r['Charge Category Code'] = line.charge_category_code ?? ''
    r['Package Quantity'] = String(line.package_quantity ?? 1)
    return r
  })
}

function buildUpsSyncTaggedFromDedupedUploads(
  deduped: ReadonlyArray<{ id: string; csv_text: string | null }>,
  profileCompanyName: string
): {
  fullRecords: InvoiceRecord[]
  upsSyncTagged: UpsRowSyncInput[]
  rowsDroppedCriticalSciCorruption: number
  duplicateChargeRowsDropped: number
} {
  let rowsDroppedCriticalSciCorruption = 0
  const taggedBeforeDedupe: Array<{ record: InvoiceRecord; uploadId: string }> = []
  for (const upload of deduped) {
    const doc = parseInvoiceCsvDocument(String(upload.csv_text ?? ''))
    rowsDroppedCriticalSciCorruption += doc.rowsDroppedCriticalSciCorruption
    const afterFilter = filterRowsLikeClubColorsPowerQuery(doc.records)
    for (const rec of afterFilter) {
      taggedBeforeDedupe.push({ record: rec, uploadId: upload.id })
    }
  }
  const { tagged, duplicatesDropped: duplicateChargeRowsDropped } =
    dedupeTaggedInvoiceRecordsStableOrder(taggedBeforeDedupe)
  const fullRecords = applyProfileSenderCompanyName(
    tagged.map((t) => t.record),
    profileCompanyName
  )
  const upsSyncTagged = tagged.map((t, i) => ({
    record: fullRecords[i]!,
    invoiceUploadId: t.uploadId,
  }))
  return {
    fullRecords,
    upsSyncTagged,
    rowsDroppedCriticalSciCorruption,
    duplicateChargeRowsDropped,
  }
}

function normalizeUpsCarrierNames(records: InvoiceRecord[]): InvoiceRecord[] {
  return records.map((r) => {
    const cn = (r['Carrier Name'] ?? '').trim()
    return cn ? r : { ...r, 'Carrier Name': 'UPS' }
  })
}

// -- Main compute function -----------------------------------------------------

/**
 * Loads all invoices for the user across carriers, applies Club Colors filtering
 * for UPS, optional dashboard filters, and returns a unified summary.
 *
 * Data sources:
 *   • invoice_uploads   → UPS CSVs (old pipeline, deduped + Club Colors filtered)
 *   • invoice_lines     → FedEx / WWE parsed lines (new pipeline, carrier ≠ 'UPS')
 *
 * UPS data from invoice_lines is intentionally excluded to avoid double-counting
 * with invoice_uploads. Both pipelines are merged before KPI computation so that
 * the Premium Analysis totals and breakdowns include all carriers.
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

  const CSV_FETCH_BATCH = 10

  // Fetch all three data sources in parallel: UPS upload metadata, master mapping,
  // and FedEx/WWE invoice metadata from the new pipeline.
  const [
    { data: uploadMeta, error: uploadError },
    { data: mappings, error: mappingsError },
    { data: nonUpsInvoices, error: nonUpsInvoicesError },
  ] = await Promise.all([
    supabase
      .from('invoice_uploads')
      .select('id, created_at, content_sha256')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    /*
     * TODO (`standardized_charge` — cross-carrier grouping + dashboard filters)
     *
     * This query already returns **`standardized_charge`** from **`master_mapping`** (canonical taxonomy, same grain as
     * multipart ingest). That column maps vendor-specific **`charge_description`** text to finance's **shared label**
     * for multicarrier rollups (`standardized_charge` is the normalization key analysts expect when stacking FedEx /
     * UPS / WWE buckets).
     *
     * It is **not yet** consumed downstream: **`buildChargeDescriptionLookup`** trims it off before **`ChargeTaxonomyValue`**,
     * so **`computeInvoiceAnalysisSummary`** and the dashboard cannot filter or group by standardized label. When
     * promoting it: thread the field through the lookup payload and summary engine (see **`buildChargeDescriptionLookup`**
     * TODO in **`analysis-summary.ts`**), regenerate filter metadata distincts, persist any new slices on saved analysis JSON,
     * and ship UI filters + charts keyed by **`standardized_charge`** alongside existing carrier/category breakdowns.
     */
    supabase.from('master_mapping').select(
      'carrier, standardized_charge, charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
    ),
    // FedEx + WWE invoices from the new pipeline. UPS is excluded here to avoid
    // double-counting with invoice_uploads.
    supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, carrier')
      .eq('user_id', user.id)
      .in('carrier', ['FedEx', 'WWE'])
      .eq('upload_status', 'processed'),
  ])

  if (uploadError) return { ok: false, status: 400, message: uploadError.message }
  // Non-fatal: log but continue — Premium Analysis still works with UPS-only data.
  if (nonUpsInvoicesError) console.warn('[premium-analysis] non-UPS invoice fetch error:', nonUpsInvoicesError.message)

  const hasUpsUploads = (uploadMeta?.length ?? 0) > 0
  const nonUpsInvoiceList = nonUpsInvoices ?? []

  // Fetch FedEx/WWE invoice_lines when invoice metadata was found.
  const nonUpsLines: RawInvoiceLine[] = []
  if (nonUpsInvoiceList.length > 0) {
    const nonUpsIds = nonUpsInvoiceList.map((i) => i.id)
    const LINE_BATCH = 50
    for (let i = 0; i < nonUpsIds.length; i += LINE_BATCH) {
      const { data: batch, error: batchErr } = await supabase
        .from('invoice_lines')
        .select(
          'invoice_id, charge_description, charge_amount, zone, destination_state, shipment_date, charge_classification_code, charge_category_code, package_quantity'
        )
        .in('invoice_id', nonUpsIds.slice(i, i + LINE_BATCH))
      if (batchErr) console.warn('[premium-analysis] invoice_lines fetch error:', batchErr.message)
      else if (batch) nonUpsLines.push(...(batch as RawInvoiceLine[]))
    }
  }

  const hasNonUps = nonUpsLines.length > 0

  // If neither data source has data, nothing to compute.
  if (!hasUpsUploads && !hasNonUps) {
    return { ok: false, status: 404, message: 'No invoice uploads found' }
  }

  // -- UPS records from invoice_uploads (Club Colors pipeline) --------------

  let fullRecords: InvoiceRecord[] = []
  let upsSyncTagged: UpsRowSyncInput[] = []
  let ingestDiagnostics: PremiumParseIngestDiagnostics = {
    duplicateUploadRowsSkipped: 0,
    duplicateChargeRowsDropped: 0,
    rowsDroppedCriticalSciCorruption: 0,
  }
  let uploadsDeduped: Array<{ id: string; created_at: string; content_sha256?: string | null }> = []

  if (hasUpsUploads) {
    const uploads: Array<{ id: string; created_at: string; content_sha256: string | null; csv_text: string | null }> = []
    const ids = (uploadMeta ?? []).map((u) => u.id)
    for (let i = 0; i < ids.length; i += CSV_FETCH_BATCH) {
      const batchIds = ids.slice(i, i + CSV_FETCH_BATCH)
      const { data: batch, error: batchErr } = await supabase
        .from('invoice_uploads')
        .select('id, created_at, content_sha256, csv_text')
        .in('id', batchIds)
      if (batchErr) return { ok: false, status: 400, message: batchErr.message }
      if (batch) uploads.push(...batch)
    }

    const uploadsMissingHash = uploads.filter((u) => !u.content_sha256 || String(u.content_sha256).length === 0)
    for (const u of uploadsMissingHash) {
      const csvText = String(u.csv_text ?? '')
      const content_sha256 = contentSha256FromStoredCsv(csvText)
      const { error: hashErr } = await supabase.from('invoice_uploads').update({ content_sha256 }).eq('id', u.id)
      if (hashErr) return { ok: false, status: 400, message: hashErr.message }
      u.content_sha256 = content_sha256
    }

    const { uploadsDeduped: deduped, duplicateUploadRowsSkipped } = dedupeInvoiceUploadRowsBySha256(uploads)
    uploadsDeduped = deduped

    const profileCompanyName = String(user.user_metadata?.company_name ?? '').trim()
    const parseCacheKey = analyzeParseCacheKey(user.id, analyzeParseCacheFingerprint(deduped))
    const cached = getAnalyzeParseCache(parseCacheKey, profileCompanyName)

    if (cached) {
      fullRecords = cached.fullRecords
      upsSyncTagged = cached.upsSyncTagged
      ingestDiagnostics = cached.ingestDiagnostics
      if (upsSyncTagged.length === 0 && deduped.length > 0) {
        const rebuilt = buildUpsSyncTaggedFromDedupedUploads(deduped, profileCompanyName)
        upsSyncTagged = rebuilt.upsSyncTagged
      }
    } else {
      const built = buildUpsSyncTaggedFromDedupedUploads(deduped, profileCompanyName)
      fullRecords = built.fullRecords
      upsSyncTagged = built.upsSyncTagged
      ingestDiagnostics = {
        duplicateUploadRowsSkipped,
        duplicateChargeRowsDropped: built.duplicateChargeRowsDropped,
        rowsDroppedCriticalSciCorruption: built.rowsDroppedCriticalSciCorruption,
      }
      setAnalyzeParseCache(parseCacheKey, profileCompanyName, fullRecords, ingestDiagnostics, upsSyncTagged)
    }

    fullRecords = normalizeUpsCarrierNames(fullRecords)
    upsSyncTagged = upsSyncTagged.map((t) => ({
      ...t,
      record: normalizeUpsCarrierNames([t.record])[0]!,
    }))
  }

  // -- FedEx / WWE records from invoice_lines --------------------------------

  const nonUpsRecords = invoiceLinesAsInvoiceRecords(nonUpsLines, nonUpsInvoiceList as RawInvoiceMeta[])

  // -- Merge and compute -----------------------------------------------------

  const allRecords = [...fullRecords, ...nonUpsRecords]

  if (mappingsError) return { ok: false, status: 400, message: mappingsError.message }

  const filterMeta = buildInvoiceAnalysisFilterMeta(allRecords)
  const records = filterInvoiceRecords(allRecords, appliedFilters)
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
      upsSyncTagged,
    },
  }
}
