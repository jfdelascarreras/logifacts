import type { SupabaseClient } from '@supabase/supabase-js'

import type { InvoiceRecord } from './csv'
import { invoiceRowHash, invoiceRowHashMultipart } from './dedupe-hash-server'
import type { ParsedInvoiceLine } from './parsers/types'
import type { Carrier } from '@/types/invoice'

export const INVOICE_ROWS_UPSERT_CHUNK = 500

/** Set to `0` to disable dual-write while rolling out read path (Phase 4b). */
export function invoiceRowsWriteEnabled(): boolean {
  return process.env.INVOICE_ROWS_WRITE !== '0'
}

export type InvoiceRowInsert = {
  user_id: string
  row_hash: string
  invoice_upload_id?: string | null
  source_invoice_id?: string | null
  account_number?: string | null
  invoice_date?: string | null
  invoice_number?: string | null
  tracking_number?: string | null
  charge_category_code?: string | null
  charge_category_detail_code?: string | null
  charge_classification_code?: string | null
  charge_description_code?: string | null
  charge_description?: string | null
  net_amount?: number | null
  invoice_amount?: number | null
  duty_amount?: number | null
  billed_weight?: number | null
  entered_weight?: number | null
  package_quantity?: number | null
  zone?: string | null
  carrier_name?: string | null
  original_service_description?: string | null
  lead_shipment_number?: string | null
  shipment_reference_number_1?: string | null
}

function textOrNull(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim()
  return v.length ? v : null
}

function amountText(value: number | string | null | undefined): string | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) return textOrNull(String(value))
  return String(n)
}

function amountOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function invoiceRecordToRow(
  rec: InvoiceRecord,
  userId: string,
  invoiceUploadId: string | null
): InvoiceRowInsert {
  const carrierName = textOrNull(rec['Carrier Name']) ?? 'UPS'
  return {
    user_id: userId,
    row_hash: invoiceRowHash(rec),
    invoice_upload_id: invoiceUploadId,
    source_invoice_id: null,
    account_number: textOrNull(rec['Account Number']),
    invoice_date: textOrNull(rec['Invoice Date']),
    invoice_number: textOrNull(rec['Invoice Number']),
    tracking_number: textOrNull(rec['Tracking Number']),
    charge_category_code: textOrNull(rec['Charge Category Code']),
    charge_category_detail_code: textOrNull(rec['Charge Category Detail Code']),
    charge_classification_code: textOrNull(rec['Charge Classification Code']),
    charge_description_code: textOrNull(rec['Charge Description Code']),
    charge_description: textOrNull(rec['Charge Description']),
    net_amount: amountOrNull(rec['Net Amount']),
    invoice_amount: amountOrNull(rec['Invoice Amount']),
    duty_amount: null,
    billed_weight: amountOrNull(rec['Billed Weight']),
    entered_weight: amountOrNull(rec['Entered Weight']),
    package_quantity: amountOrNull(rec['Package Quantity']),
    zone: textOrNull(rec['Zone']),
    carrier_name: carrierName,
    original_service_description: textOrNull(rec['Charge Description']),
    lead_shipment_number: textOrNull(rec['Lead Shipment Number']),
    shipment_reference_number_1: textOrNull(rec['Shipment Reference Number 1']),
  }
}

export function parsedLineToRow(
  line: ParsedInvoiceLine,
  userId: string,
  carrier: Carrier,
  sourceInvoiceId: string,
  invoiceNumber: string | null,
  invoiceDate: string | null
): InvoiceRowInsert {
  const netStr = amountText(line.charge_amount)
  const netNum = amountOrNull(line.charge_amount)
  return {
    user_id: userId,
    row_hash: invoiceRowHashMultipart(carrier, {
      invoice_number: line.invoice_number ?? invoiceNumber,
      charge_description: line.charge_description,
      net_amount: netStr ?? String(line.charge_amount),
      shipment_date: line.shipment_date ?? invoiceDate,
      reference_1: line.reference_1,
    }),
    invoice_upload_id: null,
    source_invoice_id: sourceInvoiceId,
    account_number: null,
    invoice_date: textOrNull(line.invoice_date ?? invoiceDate),
    invoice_number: textOrNull(line.invoice_number ?? invoiceNumber),
    tracking_number: textOrNull(line.tracking_id),
    charge_category_code: textOrNull(line.charge_category_code),
    charge_category_detail_code: null,
    charge_classification_code: textOrNull(line.charge_classification_code),
    charge_description_code: null,
    charge_description: textOrNull(line.charge_description),
    net_amount: netNum,
    invoice_amount: netNum,
    duty_amount: null,
    billed_weight: null,
    entered_weight: null,
    package_quantity: line.package_quantity ?? null,
    zone: textOrNull(line.zone),
    carrier_name: carrier,
    original_service_description: textOrNull(line.service_level),
    lead_shipment_number: null,
    shipment_reference_number_1: textOrNull(line.tracking_id ?? line.reference_1),
  }
}

export type UpsRowSyncInput = {
  record: InvoiceRecord
  invoiceUploadId: string
}

/** Upsert rows in chunks; ignores duplicates on (user_id, row_hash). */
export async function upsertInvoiceRows(
  supabase: SupabaseClient,
  rows: InvoiceRowInsert[]
): Promise<{ error?: string; inserted: number }> {
  if (rows.length === 0) return { inserted: 0 }

  let inserted = 0
  for (let i = 0; i < rows.length; i += INVOICE_ROWS_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + INVOICE_ROWS_UPSERT_CHUNK)
    const { error } = await supabase.from('invoice_rows').upsert(chunk, {
      onConflict: 'user_id,row_hash',
      ignoreDuplicates: true,
    })
    if (error) return { error: error.message, inserted }
    inserted += chunk.length
  }
  return { inserted }
}

/**
 * Replace UPS-linked rows for a user after an unfiltered analyze refresh.
 * Mirrors invoice_spend_by_date delete-then-write pattern.
 */
export async function syncUpsInvoiceRows(
  supabase: SupabaseClient,
  userId: string,
  tagged: UpsRowSyncInput[]
): Promise<{ error?: string; rowCount: number }> {
  const { error: deleteError } = await supabase
    .from('invoice_rows')
    .delete()
    .eq('user_id', userId)
    .filter('invoice_upload_id', 'not.is', null)

  if (deleteError) return { error: deleteError.message, rowCount: 0 }

  const rows = tagged.map(({ record, invoiceUploadId }) =>
    invoiceRecordToRow(record, userId, invoiceUploadId)
  )
  if (rows.length === 0) return { rowCount: 0 }

  let inserted = 0
  for (let i = 0; i < rows.length; i += INVOICE_ROWS_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + INVOICE_ROWS_UPSERT_CHUNK)
    const { error } = await supabase.from('invoice_rows').insert(chunk)
    if (error) return { error: error.message, rowCount: inserted }
    inserted += chunk.length
  }
  return { rowCount: inserted }
}

export async function syncMultipartInvoiceRows(
  supabase: SupabaseClient,
  userId: string,
  carrier: Carrier,
  sourceInvoiceId: string,
  lines: ParsedInvoiceLine[],
  invoiceNumber: string | null,
  invoiceDate: string | null
): Promise<{ error?: string; rowCount: number }> {
  const rows = lines.map((line) =>
    parsedLineToRow(line, userId, carrier, sourceInvoiceId, invoiceNumber, invoiceDate)
  )
  const { error, inserted } = await upsertInvoiceRows(supabase, rows)
  if (error) return { error, rowCount: 0 }
  return { rowCount: inserted }
}

export async function deleteInvoiceRowsForUpload(
  supabase: SupabaseClient,
  userId: string,
  invoiceUploadId: string
): Promise<void> {
  const { error } = await supabase
    .from('invoice_rows')
    .delete()
    .eq('user_id', userId)
    .eq('invoice_upload_id', invoiceUploadId)
  if (error) throw error
}

export async function deleteInvoiceRowsForSourceInvoice(
  supabase: SupabaseClient,
  userId: string,
  sourceInvoiceId: string
): Promise<void> {
  const { error } = await supabase
    .from('invoice_rows')
    .delete()
    .eq('user_id', userId)
    .eq('source_invoice_id', sourceInvoiceId)
  if (error) throw error
}
