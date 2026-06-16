import type { SupabaseClient } from '@supabase/supabase-js'

import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'

/** Row shape from `invoice_rows` (numeric columns after 20260605130000 migration). */
export type RawInvoiceRow = {
  account_number: string | null
  invoice_date: string | null
  invoice_number: string | null
  tracking_number: string | null
  charge_category_code: string | null
  charge_category_detail_code: string | null
  charge_classification_code: string | null
  charge_description_code: string | null
  charge_description: string | null
  net_amount: number | string | null
  invoice_amount: number | string | null
  billed_weight: number | string | null
  entered_weight: number | string | null
  package_quantity: number | string | null
  zone: string | null
  carrier_name: string | null
  original_service_description: string | null
  lead_shipment_number: string | null
  shipment_reference_number_1: string | null
  mapped: boolean | null
  standardized_charge: string | null
  category_1: string | null
  category_2: string | null
  category_3: string | null
  parse_version: string | null
  shipment_date: string | null
  invoice_upload_id: string | null
  source_invoice_id: string | null
}

const INVOICE_ROWS_PAGE_SIZE = 1000

const INVOICE_ROWS_SELECT_LEGACY =
  'account_number, invoice_date, invoice_number, tracking_number, charge_category_code, charge_category_detail_code, charge_classification_code, charge_description_code, charge_description, net_amount, invoice_amount, billed_weight, entered_weight, package_quantity, zone, carrier_name, original_service_description, lead_shipment_number, shipment_reference_number_1, invoice_upload_id, source_invoice_id'

const INVOICE_ROWS_SELECT_S1 =
  `${INVOICE_ROWS_SELECT_LEGACY}, mapped, standardized_charge, category_1, category_2, category_3, parse_version, shipment_date`

function isMissingColumnError(message: string): boolean {
  return /column|does not exist|42703/i.test(message)
}

function amountText(value: number | string | null | undefined): string | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) return String(value).trim() || null
  return String(n)
}

function textOrEmpty(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

/** Paginated fetch of all canonical fact rows for a user. */
export async function fetchInvoiceRowsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<RawInvoiceRow[]> {
  const rows: RawInvoiceRow[] = []
  let offset = 0
  let selectColumns = INVOICE_ROWS_SELECT_S1

  for (;;) {
    const { data, error } = await supabase
      .from('invoice_rows')
      .select(selectColumns)
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(offset, offset + INVOICE_ROWS_PAGE_SIZE - 1)

    if (error) {
      if (offset === 0 && isMissingColumnError(error.message)) {
        console.warn('[invoice-rows adapter] S1 columns missing — falling back to legacy select')
        selectColumns = INVOICE_ROWS_SELECT_LEGACY
        continue
      }
      throw new Error(`invoice_rows fetch failed: ${error.message}`)
    }

    const batch = (data ?? []) as unknown as RawInvoiceRow[]
    rows.push(...batch)
    if (batch.length < INVOICE_ROWS_PAGE_SIZE) break
    offset += INVOICE_ROWS_PAGE_SIZE
  }

  return rows
}

/** Map canonical `invoice_rows` facts into the 250-column `InvoiceRecord` shape. */
export function invoiceRowRecordsToInvoiceRecords(rows: RawInvoiceRow[]): InvoiceRecord[] {
  const emptyRow = (): InvoiceRecord =>
    Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord

  return rows.map((row) => {
    const r = emptyRow()
    const net = amountText(row.net_amount)
    const invoiceAmt = amountText(row.invoice_amount) ?? net
    const tracking = textOrEmpty(row.tracking_number)
    const shipRef = textOrEmpty(row.shipment_reference_number_1) || tracking
    const shipDate = textOrEmpty(row.shipment_date)

    r['Account Number'] = row.account_number ?? ''
    r['Invoice Date'] = row.invoice_date ?? ''
    r['Invoice Number'] = row.invoice_number ?? ''
    r['Carrier Name'] = row.carrier_name ?? 'Unknown'
    r['Charge Description'] = row.charge_description ?? ''
    r['Net Amount'] = net ?? ''
    r['Invoice Amount'] = invoiceAmt ?? ''
    r['Zone'] = row.zone ?? ''
    r['Billed Weight'] = amountText(row.billed_weight) ?? ''
    r['Entered Weight'] = amountText(row.entered_weight) ?? ''
    r['Package Quantity'] = amountText(row.package_quantity) ?? '1'
    r['Charge Category Code'] = row.charge_category_code ?? ''
    r['Charge Category Detail Code'] = row.charge_category_detail_code ?? ''
    r['Charge Classification Code'] = row.charge_classification_code ?? ''
    r['Charge Description Code'] = row.charge_description_code ?? ''
    r['Original Service Description'] =
      row.original_service_description ?? row.charge_description ?? ''
    r['Lead Shipment Number'] = row.lead_shipment_number ?? ''
    r['Shipment Date'] = shipDate
    r['Transaction Date'] = shipDate
    if (tracking) {
      r['Tracking Number'] = tracking
      r['Shipment Reference Number 1'] = shipRef
    } else if (shipRef) {
      r['Shipment Reference Number 1'] = shipRef
    }
    return r
  })
}

/** Distinct source files represented in fact rows (uploads + multipart invoices). */
export function countInvoiceRowSources(rows: RawInvoiceRow[]): number {
  const sources = new Set<string>()
  for (const row of rows) {
    if (row.invoice_upload_id) sources.add(`upload:${row.invoice_upload_id}`)
    if (row.source_invoice_id) sources.add(`invoice:${row.source_invoice_id}`)
  }
  return sources.size
}

export function parseVersionsFromInvoiceRows(rows: RawInvoiceRow[]): string[] {
  return [...new Set(rows.map((r) => textOrEmpty(r.parse_version)).filter(Boolean))].sort()
}
