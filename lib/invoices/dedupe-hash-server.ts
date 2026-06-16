import { createHash } from 'node:crypto'

import type { InvoiceRecord } from './csv'
import { normalizeCsvForDedupe } from './dedupe-hash'

/** Same fingerprint as the upload UI (UTF-8 SHA-256 hex). */
export function sha256HexUtf8Sync(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function contentSha256FromStoredCsv(csvText: string): string {
  return sha256HexUtf8Sync(normalizeCsvForDedupe(csvText))
}

/**
 * Stable dedup key for one UPS charge line (250-column CSV layout).
 *
 * Per UPS invoice spec, a unique charge is identified by the combination of:
 *   Invoice Number + Tracking Number + Charge Category Code +
 *   Charge Category Detail Code + Net Amount
 */
export function invoiceRowHash(rec: InvoiceRecord): string {
  const key = [
    'UPS',
    (rec['Invoice Number'] ?? '').trim(),
    (rec['Tracking Number'] ?? '').trim(),
    (rec['Charge Category Code'] ?? '').trim(),
    (rec['Charge Category Detail Code'] ?? '').trim(),
    (rec['Net Amount'] ?? '').trim(),
  ].join('\0')
  return sha256HexUtf8Sync(key)
}

/** Dedup key for FedEx / WWE multipart ingest lines (no UPS category codes). */
export function invoiceRowHashMultipart(
  carrier: string,
  fields: {
    invoice_number?: string | null
    charge_description: string
    net_amount: string | number
    shipment_date?: string | null
    reference_1?: string | null
    tracking_id?: string | null
    service_level?: string | null
    charge_classification_code?: string | null
    charge_category_code?: string | null
    package_quantity?: number | null
    account_number?: string | null
    billed_weight?: number | null
    entered_weight?: number | null
    transaction_date?: string | null
    parse_version?: string | null
  }
): string {
  const key = [
    carrier.trim().toUpperCase(),
    (fields.invoice_number ?? '').trim(),
    (fields.tracking_id ?? fields.reference_1 ?? '').trim(),
    fields.charge_description.trim().toUpperCase(),
    String(fields.net_amount).trim(),
    (fields.shipment_date ?? '').trim(),
  ].join('\0')
  return sha256HexUtf8Sync(key)
}
