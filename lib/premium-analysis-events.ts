/** Dispatched on `window` after POST /api/invoices/analyze completes (e.g. post-upload). */
export const PREMIUM_ANALYSIS_UPDATED = 'premium-analysis-updated' as const

export type PremiumAnalysisUpdatedDetail = {
  summary: unknown
  uploadId?: string
  uploadsAnalyzed?: number
}
