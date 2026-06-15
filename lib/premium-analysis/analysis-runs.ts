import type { SupabaseClient } from '@supabase/supabase-js'

import type { PremiumIngestSource } from '@/lib/premium-analysis/ingest-adapters/index'
import type { IngestQualityGate } from '@/lib/premium-analysis/ingest-quality'
import type { InvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'

export type AnalysisRunInsert = {
  user_id: string
  ingest_source: string | null
  total_cost: number | null
  line_count: number | null
  shipment_count: number | null
  savings_high: number | null
  unmapped_pct: number | null
  duration_ms: number | null
  filters: Record<string, unknown> | null
}

export type AnalysisRunRow = AnalysisRunInsert & {
  id: string
  created_at: string
}

export function buildAnalysisRunRow(
  userId: string,
  summary: InvoiceAnalysisSummary & {
    ingestSource?: PremiumIngestSource | 'invoice_rows' | 'legacy'
    ingestQuality?: IngestQualityGate
    appliedFilters?: unknown
  },
  durationMs: number
): AnalysisRunInsert {
  const unmappedPct = summary.ingestQuality?.unmappedPctOfSpend
  return {
    user_id: userId,
    ingest_source: summary.ingestSource ?? null,
    total_cost: summary.measures.totalCost ?? null,
    line_count: summary.totalRows ?? null,
    shipment_count: summary.measures.packageDedupeShipmentCount ?? null,
    savings_high: summary.savingsEstimate?.high ?? null,
    unmapped_pct: unmappedPct != null ? +unmappedPct.toFixed(4) : null,
    duration_ms: durationMs,
    filters:
      summary.appliedFilters && typeof summary.appliedFilters === 'object'
        ? (summary.appliedFilters as Record<string, unknown>)
        : null,
  }
}

/** Non-fatal audit row for regression tracking. */
export async function recordAnalysisRun(
  supabase: SupabaseClient,
  row: AnalysisRunInsert
): Promise<void> {
  const { error } = await supabase.from('analysis_runs').insert(row)
  if (error) {
    console.warn('[analysis-runs] insert failed:', error.message)
  }
}

/** Latest persisted runs for run-over-run regression (unfiltered refreshes only). */
export async function fetchLatestAnalysisRuns(
  supabase: SupabaseClient,
  userId: string,
  limit = 2
): Promise<AnalysisRunRow[]> {
  const { data, error } = await supabase
    .from('analysis_runs')
    .select(
      'id, created_at, ingest_source, total_cost, line_count, shipment_count, savings_high, unmapped_pct, duration_ms, filters'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 3, 5))

  if (error) {
    console.warn('[analysis-runs] fetch failed:', error.message)
    return []
  }

  const unfiltered = ((data ?? []) as AnalysisRunRow[]).filter((row) => {
    if (row.filters == null) return true
    return typeof row.filters === 'object' && Object.keys(row.filters).length === 0
  })

  return unfiltered.slice(0, limit)
}
