import type { SupabaseClient } from '@supabase/supabase-js'

import { invalidateAnalysisCache } from '@/lib/cache/analysis-cache'
import { redis } from '@/lib/cache/redis'

async function deleteLegacyInvoices(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: invoices, error: listError } = await admin
    .from('invoices')
    .select('id')
    .eq('user_id', userId)

  if (listError) {
    const code = (listError as { code?: string }).code
    if (code === '42P01' || listError.message.includes('does not exist')) return
    throw listError
  }

  const invoiceIds = (invoices ?? []).map((row) => row.id as string)
  if (invoiceIds.length === 0) return

  const { error: linesError } = await admin.from('invoice_lines').delete().in('invoice_id', invoiceIds)
  if (linesError) throw linesError

  const { error: invoicesError } = await admin.from('invoices').delete().eq('user_id', userId)
  if (invoicesError) throw invoicesError
}

async function invalidateInvoiceAnalysisKeys(userId: string): Promise<void> {
  await invalidateAnalysisCache(userId)
  if (!redis) return

  try {
    let cursor = 0
    do {
      const result = await redis.scan(cursor, {
        match: `invoice_analysis:${userId}:*`,
        count: 100,
      })
      cursor = Number(result[0])
      const keys = result[1]
      if (keys.length) await redis.del(...keys)
    } while (cursor !== 0)
  } catch {
    // non-fatal
  }
}

/** Removes all application data scoped to a user before deleting the auth record. */
export async function deleteUserData(admin: SupabaseClient, userId: string): Promise<void> {
  const tables = [
    'invoice_upload_analyses',
    'invoice_spend_by_date',
    'invoice_rows',
    'raw_invoice_files',
    'invoice_uploads',
    'user_products',
    'user_contract_discounts',
  ] as const

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01' || error.message.includes('does not exist')) continue
      throw error
    }
  }

  await deleteLegacyInvoices(admin, userId)
  await invalidateInvoiceAnalysisKeys(userId)
}
