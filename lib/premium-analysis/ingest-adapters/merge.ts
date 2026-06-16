import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'
import { mergeParseVersions } from '@/lib/premium-analysis/ingest-diagnostics'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'

import type { CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'

export type MergedIngestResult = {
  records: InvoiceRecord[]
  sourceCount: number
  diagnostics: PremiumParseIngestDiagnostics
  upsSyncTagged: UpsRowSyncInput[]
  /** Which read path produced records (S3 unified ingest). */
  ingestSource?: 'invoice_rows' | 'legacy'
}

/** Combine per-carrier adapter outputs into one charge-line set for aggregation. */
export function mergeCarrierIngestResults(
  parts: Array<CarrierIngestResult | null>
): MergedIngestResult {
  const diagnostics: PremiumParseIngestDiagnostics = { ...ZERO_INGEST_DIAGNOSTICS }
  const records: InvoiceRecord[] = []
  const upsSyncTagged: UpsRowSyncInput[] = []
  const versionParts: string[] = []
  let sourceCount = 0

  for (const part of parts) {
    if (!part || part.records.length === 0) continue
    records.push(...part.records)
    sourceCount += part.sourceCount
    diagnostics.duplicateUploadRowsSkipped += part.diagnostics.duplicateUploadRowsSkipped
    diagnostics.duplicateChargeRowsDropped += part.diagnostics.duplicateChargeRowsDropped
    diagnostics.rowsDroppedCriticalSciCorruption +=
      part.diagnostics.rowsDroppedCriticalSciCorruption
    versionParts.push(...(part.diagnostics.parseVersions ?? []))
    if (part.upsSyncTagged?.length) {
      upsSyncTagged.push(...part.upsSyncTagged)
    }
  }

  diagnostics.parseVersions = mergeParseVersions(versionParts)

  return { records, sourceCount, diagnostics, upsSyncTagged }
}
