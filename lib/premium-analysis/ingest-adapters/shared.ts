import type { SupabaseClient } from '@supabase/supabase-js'

import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'
import type { Carrier } from '@/types/invoice'

export type RawInvoiceLine = {
  invoice_id: string
  charge_description: string
  charge_amount: number
  zone: string | null
  destination_state: string | null
  shipment_date: string | null
  reference_1: string | null
  service_level: string | null
  charge_classification_code: string | null
  charge_category_code: string | null
  package_quantity: number | null
}

export type RawInvoiceMeta = {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  carrier: string
}

/** PostgREST default max rows — paginate past this when loading large FedEx/WWE invoices. */
const INVOICE_LINES_PAGE_SIZE = 1000

/** Fetch processed multipart invoice headers for the given carriers. */
export async function fetchProcessedInvoiceMeta(
  supabase: SupabaseClient,
  userId: string,
  carriers: Carrier[]
): Promise<RawInvoiceMeta[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, carrier')
    .eq('user_id', userId)
    .in('carrier', carriers)
    .eq('upload_status', 'processed')

  if (error) {
    console.warn('[ingest-adapters] invoice metadata fetch error:', error.message)
    return []
  }
  return (data ?? []) as RawInvoiceMeta[]
}

const INVOICE_LINE_SELECT =
  'invoice_id, charge_description, charge_amount, zone, destination_state, shipment_date, reference_1, service_level, charge_classification_code, charge_category_code, package_quantity'

/** Fetch all `invoice_lines` for one invoice (paginated — Supabase caps at 1000 rows per request). */
async function fetchInvoiceLinesForId(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<RawInvoiceLine[]> {
  const lines: RawInvoiceLine[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select(INVOICE_LINE_SELECT)
      .eq('invoice_id', invoiceId)
      .order('id', { ascending: true })
      .range(offset, offset + INVOICE_LINES_PAGE_SIZE - 1)
    if (error) {
      console.warn('[ingest-adapters] invoice_lines fetch error:', error.message)
      break
    }
    const batch = (data ?? []) as RawInvoiceLine[]
    lines.push(...batch)
    if (batch.length < INVOICE_LINES_PAGE_SIZE) break
    offset += INVOICE_LINES_PAGE_SIZE
  }
  return lines
}

/** Fetch all `invoice_lines` for the given invoice ids (no 1000-row cap). */
export async function fetchInvoiceLines(
  supabase: SupabaseClient,
  invoiceIds: string[]
): Promise<RawInvoiceLine[]> {
  const lines: RawInvoiceLine[] = []
  for (const invoiceId of invoiceIds) {
    lines.push(...(await fetchInvoiceLinesForId(supabase, invoiceId)))
  }
  return lines
}

/** Map multipart `invoice_lines` rows into the 250-column `InvoiceRecord` shape. */
export function invoiceLinesToRecords(
  lines: RawInvoiceLine[],
  invoices: RawInvoiceMeta[]
): InvoiceRecord[] {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]))
  const emptyRow = (): InvoiceRecord =>
    Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord

  return lines.map((line) => {
    const inv = invoiceMap.get(line.invoice_id)
    const r = emptyRow()
    r['Charge Description'] = line.charge_description
    r['Net Amount'] = String(line.charge_amount)
    r['Invoice Amount'] = String(line.charge_amount)
    r['Invoice Number'] = inv?.invoice_number ?? ''
    r['Invoice Date'] = inv?.invoice_date ?? ''
    r['Carrier Name'] = inv?.carrier ?? 'Unknown'
    r['Zone'] = line.zone ?? ''
    r['Receiver State'] = line.destination_state ?? ''
    r['Shipment Date'] = line.shipment_date ?? ''
    const trackingOrRef = (line.reference_1 ?? '').trim()
    if (trackingOrRef) {
      r['Tracking Number'] = trackingOrRef
      r['Shipment Reference Number 1'] = trackingOrRef
    }
    r['Original Service Description'] = line.service_level ?? ''
    r['Charge Classification Code'] = line.charge_classification_code ?? ''
    r['Charge Category Code'] = line.charge_category_code ?? ''
    r['Package Quantity'] = String(line.package_quantity ?? 1)
    return r
  })
}
