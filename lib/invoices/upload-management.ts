import type { SupabaseClient } from '@supabase/supabase-js'

import { invalidateAnalysisCache } from '@/lib/cache/analysis-cache'
import { redis } from '@/lib/cache/redis'

/** `csv` = `invoice_uploads` (UPS raw CSV). `invoice` = `invoices` (FedEx/WWE multipart ingest). */
export type InvoiceUploadSource = 'csv' | 'invoice'

export type StoredInvoiceUploadItem = {
  id: string
  source: InvoiceUploadSource
  filename: string
  carrier: string
  created_at: string
  row_count: number | null
  status: string
  total_amount: number | null
}

export type DeleteUploadItemResult = {
  id: string
  source: InvoiceUploadSource
  deletedFileName: string
  ok: boolean
  error?: string
}

function cleanFilename(name: string): string {
  return name.replace(/^(UTF-8|ISO-8859-\d+)'[a-z]*'?/i, '') || name
}

async function invalidateInvoiceRedisKeys(userId: string, invoiceId?: string): Promise<void> {
  if (!redis) return
  try {
    const pattern = invoiceId
      ? `invoice_analysis:${userId}:${invoiceId}:*`
      : `invoice_analysis:${userId}:*`
    let cursor = 0
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 })
      cursor = Number(result[0])
      const keys = result[1]
      if (keys.length) await redis.del(...keys)
    } while (cursor !== 0)
  } catch {
    // non-fatal
  }
}

export async function listUserInvoiceUploads(
  supabase: SupabaseClient,
  userId: string
): Promise<StoredInvoiceUploadItem[]> {
  const [{ data: csvUploads, error: csvError }, { data: invoiceRows, error: invoiceError }] =
    await Promise.all([
      supabase
        .from('invoice_uploads')
        .select('id, original_file_name, created_at, row_count, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('invoices')
        .select('id, filename, carrier, created_at, upload_status, total_amount')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  if (csvError) throw csvError
  if (invoiceError) throw invoiceError

  const csvItems: StoredInvoiceUploadItem[] = (csvUploads ?? []).map((row) => ({
    id: row.id,
    source: 'csv' as const,
    filename: cleanFilename(String(row.original_file_name ?? '')),
    carrier: 'UPS',
    created_at: row.created_at,
    row_count: row.row_count,
    status: String(row.status ?? 'uploaded'),
    total_amount: null,
  }))

  const invoiceItems: StoredInvoiceUploadItem[] = (invoiceRows ?? []).map((row) => ({
    id: row.id,
    source: 'invoice' as const,
    filename: cleanFilename(String(row.filename ?? '')),
    carrier: String(row.carrier ?? 'Unknown'),
    created_at: row.created_at,
    row_count: null,
    status: String(row.upload_status ?? 'processed'),
    total_amount: row.total_amount != null ? Number(row.total_amount) : null,
  }))

  return [...csvItems, ...invoiceItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function countUserInvoiceUploads(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const [{ count: csvCount, error: csvError }, { count: invoiceCount, error: invoiceError }] =
    await Promise.all([
      supabase
        .from('invoice_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])

  if (csvError) throw csvError
  if (invoiceError) throw invoiceError
  return (csvCount ?? 0) + (invoiceCount ?? 0)
}

async function clearAnalysisArtifactsIfEmpty(
  supabase: SupabaseClient,
  userId: string,
  remaining: number
): Promise<boolean> {
  if (remaining > 0) return false

  await supabase.from('invoice_upload_analyses').delete().eq('user_id', userId)
  await supabase.from('invoice_spend_by_date').delete().eq('user_id', userId)
  await invalidateAnalysisCache(userId)
  return true
}

export async function deleteCsvUpload(
  supabase: SupabaseClient,
  userId: string,
  uploadId: string
): Promise<{ deletedFileName: string; remainingUploads: number; cleared: boolean }> {
  const { data: upload, error: uploadError } = await supabase
    .from('invoice_uploads')
    .select('id, original_file_name')
    .eq('id', uploadId)
    .eq('user_id', userId)
    .maybeSingle()

  if (uploadError) throw uploadError
  if (!upload) {
    const err = new Error('Upload not found')
    ;(err as Error & { status?: number }).status = 404
    throw err
  }

  const { error: analysisDeleteError } = await supabase
    .from('invoice_upload_analyses')
    .delete()
    .eq('invoice_upload_id', uploadId)
    .eq('user_id', userId)

  if (analysisDeleteError) throw analysisDeleteError

  const { error: uploadDeleteError } = await supabase
    .from('invoice_uploads')
    .delete()
    .eq('id', uploadId)
    .eq('user_id', userId)

  if (uploadDeleteError) throw uploadDeleteError

  await invalidateAnalysisCache(userId)

  const remaining = await countUserInvoiceUploads(supabase, userId)
  const cleared = await clearAnalysisArtifactsIfEmpty(supabase, userId, remaining)

  return {
    deletedFileName: cleanFilename(String(upload.original_file_name ?? '')),
    remainingUploads: remaining,
    cleared,
  }
}

export async function deleteInvoiceRecord(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string
): Promise<{ deletedFileName: string; remainingUploads: number; cleared: boolean }> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, filename')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (invoiceError) throw invoiceError
  if (!invoice) {
    const err = new Error('Invoice not found')
    ;(err as Error & { status?: number }).status = 404
    throw err
  }

  const { error: linesError } = await supabase
    .from('invoice_lines')
    .delete()
    .eq('invoice_id', invoiceId)

  if (linesError) throw linesError

  const { error: deleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('user_id', userId)

  if (deleteError) throw deleteError

  await invalidateInvoiceRedisKeys(userId, invoiceId)
  await invalidateAnalysisCache(userId)

  const remaining = await countUserInvoiceUploads(supabase, userId)
  const cleared = await clearAnalysisArtifactsIfEmpty(supabase, userId, remaining)

  return {
    deletedFileName: cleanFilename(String(invoice.filename ?? '')),
    remainingUploads: remaining,
    cleared,
  }
}

export async function deleteUserInvoiceUpload(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  source: InvoiceUploadSource
): Promise<{ deletedFileName: string; remainingUploads: number; cleared: boolean }> {
  if (source === 'invoice') {
    return deleteInvoiceRecord(supabase, userId, id)
  }
  return deleteCsvUpload(supabase, userId, id)
}

export function parseUploadSource(raw: string | null | undefined): InvoiceUploadSource {
  return raw === 'invoice' ? 'invoice' : 'csv'
}
