import { toNumber, type InvoiceRecord } from '@/lib/invoices/csv'
import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'

export type IngestShadowCompareResult = {
  ok: boolean
  factsTotal: number
  legacyTotal: number
  delta: number
  deltaPct: number
  factsLineCount: number
  legacyLineCount: number
}

const DEFAULT_SHADOW_THRESHOLD_PCT = 0.001

export function sumRecordNetAmount(records: InvoiceRecord[]): number {
  return records.reduce((sum, rec) => sum + toNumber(rec['Net Amount']), 0)
}

/**
 * Compare invoice_rows read path vs legacy adapters on total net spend.
 * Logs when delta exceeds threshold (default 0.1%).
 */
export function shadowCompareIngestTotals(
  factsRecords: InvoiceRecord[],
  legacyRecords: InvoiceRecord[],
  thresholdPct = DEFAULT_SHADOW_THRESHOLD_PCT
): IngestShadowCompareResult {
  const factsTotal = sumRecordNetAmount(factsRecords)
  const legacyTotal = sumRecordNetAmount(legacyRecords)
  const delta = Math.abs(factsTotal - legacyTotal)
  const base = Math.max(factsTotal, legacyTotal, 1)
  const deltaPct = delta / base
  const ok = legacyRecords.length === 0 || deltaPct <= thresholdPct

  if (!ok) {
    console.warn('[ingest-shadow] invoice_rows vs legacy total spend mismatch', {
      factsTotal: +factsTotal.toFixed(2),
      legacyTotal: +legacyTotal.toFixed(2),
      deltaPct: `${(deltaPct * 100).toFixed(3)}%`,
      factsLines: factsRecords.length,
      legacyLines: legacyRecords.length,
    })
  }

  return {
    ok,
    factsTotal: +factsTotal.toFixed(2),
    legacyTotal: +legacyTotal.toFixed(2),
    delta: +delta.toFixed(2),
    deltaPct,
    factsLineCount: factsRecords.length,
    legacyLineCount: legacyRecords.length,
  }
}

export type IngestQualityGate = {
  blockSavings: boolean
  unmappedPctOfSpend: number
  thresholdPct: number
  reason: string | null
}

const DEFAULT_UNMAPPED_THRESHOLD_PCT = 0.15

export function ingestQualityBlockSavingsEnabled(): boolean {
  return process.env.INGEST_QUALITY_BLOCK_SAVINGS !== '0'
}

/**
 * Gate savings opportunities when too much spend lacks taxonomy mapping.
 * Default: block when unmappedSpend / totalCost > 15%.
 */
export function evaluateIngestQuality(
  diagnostics: Pick<PremiumParseIngestDiagnostics, 'unmappedSpend'>,
  totalCost: number,
  thresholdPct = DEFAULT_UNMAPPED_THRESHOLD_PCT
): IngestQualityGate {
  const unmappedPctOfSpend = totalCost > 0 ? diagnostics.unmappedSpend / totalCost : 0
  const overThreshold = unmappedPctOfSpend > thresholdPct

  if (!ingestQualityBlockSavingsEnabled()) {
    return {
      blockSavings: false,
      unmappedPctOfSpend,
      thresholdPct,
      reason: null,
    }
  }

  return {
    blockSavings: overThreshold,
    unmappedPctOfSpend,
    thresholdPct,
    reason: overThreshold
      ? `${(unmappedPctOfSpend * 100).toFixed(1)}% of spend is unmapped (threshold ${(thresholdPct * 100).toFixed(0)}%) — update charge taxonomy before trusting savings estimates.`
      : null,
  }
}

export function applyIngestQualityGate<T extends { savingsEstimate?: unknown; actionItems?: unknown }>(
  summary: T,
  gate: IngestQualityGate
): T {
  if (!gate.blockSavings) return summary
  return {
    ...summary,
    savingsEstimate: undefined,
    actionItems: [],
  }
}
