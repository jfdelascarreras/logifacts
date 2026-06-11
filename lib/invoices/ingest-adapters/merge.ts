import type { PremiumParseIngestDiagnostics } from '@/lib/invoices/analyze-parse-cache'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'

import type { CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'

export type MergedIngestResult = {
  records: InvoiceRecord[]
  sourceCount: number
  diagnostics: PremiumParseIngestDiagnostics
  upsSyncTagged: UpsRowSyncInput[]
}

/** Combine per-carrier adapter outputs into one charge-line set for aggregation. */
export function mergeCarrierIngestResults(
  parts: Array<CarrierIngestResult | null>
): MergedIngestResult {
  const diagnostics: PremiumParseIngestDiagnostics = { ...ZERO_INGEST_DIAGNOSTICS }
  const records: InvoiceRecord[] = []
  const upsSyncTagged: UpsRowSyncInput[] = []
  let sourceCount = 0

  for (const part of parts) {
    if (!part || part.records.length === 0) continue
    records.push(...part.records)
    sourceCount += part.sourceCount
    diagnostics.duplicateUploadRowsSkipped += part.diagnostics.duplicateUploadRowsSkipped
    diagnostics.duplicateChargeRowsDropped += part.diagnostics.duplicateChargeRowsDropped
    diagnostics.rowsDroppedCriticalSciCorruption +=
      part.diagnostics.rowsDroppedCriticalSciCorruption
    if (part.upsSyncTagged?.length) {
      upsSyncTagged.push(...part.upsSyncTagged)
    }
  }

  return { records, sourceCount, diagnostics, upsSyncTagged }
}
