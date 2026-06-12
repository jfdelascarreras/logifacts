import type { SupabaseClient } from '@supabase/supabase-js'

import type { InvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'

type DashboardSummary = InvoiceAnalysisSummary & Record<string, unknown>

/**
 * Persist one canonical Premium Analysis JSON row per user (full dataset, all carriers).
 * Replaces any prior rows so GET always returns the latest combined summary.
 */
export async function persistPremiumAnalysisCache(
  supabase: SupabaseClient,
  userId: string,
  summary: DashboardSummary
): Promise<{ error?: string; uploadId?: string; warning?: string }> {
  const {
    data: latestUpload,
    error: latestUploadErr,
  } = await supabase
    .from('invoice_uploads')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestUploadErr) {
    return { error: latestUploadErr.message }
  }

  const { error: clearErr } = await supabase
    .from('invoice_upload_analyses')
    .delete()
    .eq('user_id', userId)

  if (clearErr) {
    return { error: clearErr.message }
  }

  const invoiceUploadId = latestUpload?.id ?? null

  const { error: insertErr } = await supabase.from('invoice_upload_analyses').insert({
    user_id: userId,
    invoice_upload_id: invoiceUploadId,
    summary,
  })

  if (insertErr) {
    // Multipart-only users need nullable invoice_upload_id (see migration 20260611120000).
    if (!invoiceUploadId) {
      return {
        warning: `analysis-cache: ${insertErr.message}`,
      }
    }
    return { error: insertErr.message }
  }

  return { uploadId: invoiceUploadId ?? undefined }
}
