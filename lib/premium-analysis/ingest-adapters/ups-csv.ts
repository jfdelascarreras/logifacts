import {
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
  getAnalyzeParseCacheAsync,
  setAnalyzeParseCacheAsync,
} from '@/lib/premium-analysis/analyze-parse-cache'
import { contentSha256FromStoredCsv } from '@/lib/invoices/dedupe-hash-server'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'

import type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'

const CSV_FETCH_BATCH = 10

function normalizeUpsCarrierNames(records: InvoiceRecord[]): InvoiceRecord[] {
  return records.map((r) => {
    const cn = (r['Carrier Name'] ?? '').trim()
    return cn ? r : { ...r, 'Carrier Name': 'UPS' }
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

/**
 * UPS via raw CSV in `invoice_uploads` — full 250-column fidelity, Club Colors filter, dedupe.
 */
export const upsCsvIngestAdapter: CarrierIngestAdapter = {
  carrier: 'UPS',
  async load(ctx: CarrierIngestContext): Promise<CarrierIngestResult | null> {
    const { data: uploadMeta, error: uploadError } = await ctx.supabase
      .from('invoice_uploads')
      .select('id, created_at, content_sha256')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (uploadError) throw new Error(uploadError.message)
    if (!uploadMeta?.length) return null

    const uploads: Array<{
      id: string
      created_at: string
      content_sha256: string | null
      csv_text: string | null
    }> = []
    const ids = uploadMeta.map((u) => u.id)
    for (let i = 0; i < ids.length; i += CSV_FETCH_BATCH) {
      const batchIds = ids.slice(i, i + CSV_FETCH_BATCH)
      const { data: batch, error: batchErr } = await ctx.supabase
        .from('invoice_uploads')
        .select('id, created_at, content_sha256, csv_text')
        .in('id', batchIds)
      if (batchErr) throw new Error(batchErr.message)
      if (batch) uploads.push(...batch)
    }

    const uploadsMissingHash = uploads.filter(
      (u) => !u.content_sha256 || String(u.content_sha256).length === 0
    )
    for (const u of uploadsMissingHash) {
      const csvText = String(u.csv_text ?? '')
      const content_sha256 = contentSha256FromStoredCsv(csvText)
      const { error: hashErr } = await ctx.supabase
        .from('invoice_uploads')
        .update({ content_sha256 })
        .eq('id', u.id)
      if (hashErr) throw new Error(hashErr.message)
      u.content_sha256 = content_sha256
    }

    const { uploadsDeduped: deduped, duplicateUploadRowsSkipped } =
      dedupeInvoiceUploadRowsBySha256(uploads)

    const parseCacheKey = analyzeParseCacheKey(
      ctx.user.id,
      analyzeParseCacheFingerprint(deduped)
    )
    const cached = await getAnalyzeParseCacheAsync(parseCacheKey, ctx.profileCompanyName)

    let fullRecords: InvoiceRecord[]
    let upsSyncTagged: UpsRowSyncInput[]
    let diagnostics = { ...ZERO_INGEST_DIAGNOSTICS }

    if (cached) {
      fullRecords = cached.fullRecords
      upsSyncTagged = cached.upsSyncTagged
      diagnostics = cached.ingestDiagnostics
      if (upsSyncTagged.length === 0 && deduped.length > 0) {
        const rebuilt = buildUpsSyncTaggedFromDedupedUploads(deduped, ctx.profileCompanyName)
        upsSyncTagged = rebuilt.upsSyncTagged
      }
    } else {
      const built = buildUpsSyncTaggedFromDedupedUploads(deduped, ctx.profileCompanyName)
      fullRecords = built.fullRecords
      upsSyncTagged = built.upsSyncTagged
      diagnostics = {
        duplicateUploadRowsSkipped,
        duplicateChargeRowsDropped: built.duplicateChargeRowsDropped,
        rowsDroppedCriticalSciCorruption: built.rowsDroppedCriticalSciCorruption,
        linesTotal: 0,
        linesMapped: 0,
        unmappedSpend: 0,
        shipmentsTotal: 0,
        shipmentsWithoutTracking: 0,
        linesMissingShipDate: 0,
        parseVersions: [],
      }
      await setAnalyzeParseCacheAsync(
        parseCacheKey,
        ctx.profileCompanyName,
        fullRecords,
        diagnostics,
        upsSyncTagged
      )
    }

    fullRecords = normalizeUpsCarrierNames(fullRecords)
    upsSyncTagged = upsSyncTagged.map((t) => ({
      ...t,
      record: normalizeUpsCarrierNames([t.record])[0]!,
    }))

    return {
      carrier: 'UPS',
      records: fullRecords,
      sourceCount: deduped.length,
      diagnostics,
      upsSyncTagged,
    }
  },
}
