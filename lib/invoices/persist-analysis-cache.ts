import type { SupabaseClient } from '@supabase/supabase-js'

import type { InvoiceAnalysisSummary } from '@/lib/invoices/analysis-summary'

type DashboardSummary = InvoiceAnalysisSummary & Record<string, unknown>

/**
 * Persist Premium Analysis JSON for subsequent GET /api/invoices/analyze.
 *
 * When the user has `invoice_uploads`, cache is keyed to the latest upload (existing behavior).
 * FedEx/WWE-only users get a user-scoped row with `invoice_upload_id = null`.
 */
export async function persistPremiumAnalysisCache(
  supabase: SupabaseClient,
  userId: string,
  summary: DashboardSummary
): Promise<{ error?: string; uploadId?: string }> {
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

  if (latestUpload?.id) {
    const { error: upsertError } = await supabase
      .from('invoice_upload_analyses')
      .upsert(
        { user_id: userId, invoice_upload_id: latestUpload.id, summary },
        { onConflict: 'invoice_upload_id' }
      )
    if (upsertError) return { error: upsertError.message }
    return { uploadId: latestUpload.id }
  }

  const { data: existing, error: existingErr } = await supabase
    .from('invoice_upload_analyses')
    .select('id')
    .eq('user_id', userId)
    .is('invoice_upload_id', null)
    .maybeSingle()

  if (existingErr) return { error: existingErr.message }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('invoice_upload_analyses')
      .update({ summary, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId)
    if (updateErr) return { error: updateErr.message }
    return {}
  }

  const { error: insertErr } = await supabase.from('invoice_upload_analyses').insert({
    user_id: userId,
    invoice_upload_id: null,
    summary,
  })
  if (insertErr) return { error: insertErr.message }
  return {}
}
