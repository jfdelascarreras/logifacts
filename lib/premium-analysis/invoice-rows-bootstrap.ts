import type { SupabaseClient, User } from '@supabase/supabase-js'

import {
  invoiceRowsWriteEnabled,
  syncUpsInvoiceRows,
} from '@/lib/invoices/invoice-rows'
import { upsCsvIngestAdapter } from '@/lib/premium-analysis/ingest-adapters/ups-csv'

/** Max multipart rows to backfill per invoice when facts table is empty (S6 migration). */
const MULTIPART_BOOTSTRAP_CHUNK = 500

/**
 * One-time backfill when `invoice_rows` is empty but legacy storage still has data.
 * UPS: sync from `invoice_uploads` CSV. FedEx/WWE: re-project `invoice_lines` → facts.
 */
export async function bootstrapInvoiceRowsIfEmpty(
  supabase: SupabaseClient,
  user: User
): Promise<{ bootstrapped: boolean; upsRows: number; multipartRows: number }> {
  if (!invoiceRowsWriteEnabled()) {
    return { bootstrapped: false, upsRows: 0, multipartRows: 0 }
  }

  let upsRows = 0
  let multipartRows = 0

  const ctx = {
    supabase,
    user,
    profileCompanyName: String(user.user_metadata?.company_name ?? '').trim(),
  }

  const upsResult = await upsCsvIngestAdapter.load(ctx)
  if (upsResult?.upsSyncTagged?.length) {
    const sync = await syncUpsInvoiceRows(supabase, user.id, upsResult.upsSyncTagged)
    if (!sync.error) upsRows = sync.rowCount
  }

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, carrier, invoice_number, invoice_date')
    .eq('user_id', user.id)
    .eq('upload_status', 'processed')
    .in('carrier', ['FedEx', 'WWE'])

  for (const inv of invoices ?? []) {
    const { count } = await supabase
      .from('invoice_rows')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_invoice_id', inv.id)

    if ((count ?? 0) > 0) continue

    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', inv.id)
      .limit(10_000)

    if (!lines?.length) continue

    const { syncMultipartInvoiceRows } = await import('@/lib/invoices/invoice-rows')
    const sync = await syncMultipartInvoiceRows(
      supabase,
      user.id,
      inv.id,
      lines,
      inv.invoice_number,
      inv.invoice_date
    )
    if (!sync.error) multipartRows += sync.rowCount
    if (multipartRows >= MULTIPART_BOOTSTRAP_CHUNK * 20) break
  }

  const bootstrapped = upsRows > 0 || multipartRows > 0
  if (bootstrapped) {
    console.info('[ingest] bootstrapped invoice_rows from legacy storage', {
      upsRows,
      multipartRows,
    })
  }

  return { bootstrapped, upsRows, multipartRows }
}
