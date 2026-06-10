/**
 * Detect Excel / parser corruption on identifier-like fields (scientific notation)
 * and normalize CSV ingestion so IDs remain plain strings.
 */

import type { InvoiceRecord } from './csv'

/** Obvious decimal scientific form from Excel floats: `3.76123E+14` */
const DECIMAL_SCI_SUBSTRING_RE = /\d+\.\d+[eE][+-]?\d+/

/** Entire cell is a numeric scientific literal with signed exponent (`3e+12`). */
const FULL_CELL_NUMERIC_SCI_RE = /^[+-]?\d+(?:\.\d+)?[eE]([+-])(\d+)$/i

/**
 * Returns true when a field value strongly suggests float scientific corruption,
 * without flagging alphanumeric IDs like `0000376E74425` (no decimal, no exponent sign).
 */
export function identifierLooksScientificNotationCorrupted(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return false

  if (DECIMAL_SCI_SUBSTRING_RE.test(s)) return true

  const fm = FULL_CELL_NUMERIC_SCI_RE.exec(s)
  if (!fm) return false
  const expPart = fm[2] ?? ''
  // Very long exponent parts are uncommon for doubles but show up when `E…` was part of an ID.
  if (expPart.length > 6) return false
  const expVal = Number(expPart)
  if (!Number.isFinite(expVal) || expVal > 499) return false
  return true
}

/** UPS columns that behave as identifiers / dimensions (scan for SCI corruption only). */
export const UPS_IDENTIFIER_LIKE_COLUMNS: ReadonlyArray<keyof InvoiceRecord> = [
  'Version',
  'Recipient Number',
  'Account Number',
  'Invoice Number',
  'Invoice Type Code',
  'Invoice Type Detail Code',
  'Account Tax ID',
  'Pickup Record Number',
  'Lead Shipment Number',
  'World Ease Number',
  'Shipment Reference Number 1',
  'Shipment Reference Number 2',
  'Bill Option Code',
  'Tracking Number',
  'Package Reference Number 1',
  'Package Reference Number 2',
  'Package Reference Number 3',
  'Package Reference Number 4',
  'Package Reference Number 5',
  'Charge Category Code',
  'Charge Category Detail Code',
  'Charge Source',
  'Type Code 1',
  'Type Detail Code 1',
  'Type Detail Value 1',
  'Type Code 2',
  'Type Detail Code 2',
  'Type Detail Value 2',
  'Charge Classification Code',
  'Charge Description Code',
  'Alternate Invoice Number',
  'Store Number',
  'Customer Reference Number',
  'Customs Number',
  'Declaration Number',
  'Master Air Waybill Number',
  'Foreign Trade Reference Number',
  'Carrier Name',
  'CCCD Number',
  'Job Number',
  'Document Number',
  'Office Number',
  'Class Number',
  'Other Customs Number',
  'Original tracking number',
  'BOL # 1',
  'BOL # 2',
  'BOL # 3',
  'BOL # 4',
  'BOL # 5',
  'PO # 1',
  'PO # 2',
  'PO # 3',
  'PO # 4',
  'PO # 5',
  'PO # 6',
  'PO # 7',
  'PO # 8',
  'PO # 9',
  'PO # 10',
  'NMFC',
  'Detail Class',
  'Freight Sequence Number',
  'Declared Freight Class',
  'EORI Number',
  'Shipment Description',
]

/** If SCI corruption blanks these columns, discard the charge line (can't attribute reliably). */
const CRITICAL_DROP_ROW_COLUMNS: ReadonlyArray<keyof InvoiceRecord> = ['Invoice Number', 'Account Number']

/** Force string coercion + SCI checks on identifier-like columns after CSV parse */
export function sanitizeInvoiceRecordIdentifiers(
  rec: InvoiceRecord
): { record: InvoiceRecord; dropRow: boolean; corruptedFields: string[] } {
  const out = { ...rec }
  const corruptedFields: string[] = []

  for (const col of UPS_IDENTIFIER_LIKE_COLUMNS) {
    const raw = rec[col]
    const v = raw == null ? '' : String(raw).trim()
    // Always store as trimmed string/null for these columns — never inferred numeric.
    let nextVal: string | null = v ? v : null
    if (nextVal !== null && identifierLooksScientificNotationCorrupted(nextVal)) {
      corruptedFields.push(col)
      nextVal = null
    }
    out[col] = nextVal === '' ? null : nextVal
  }

  const dropRow = corruptedFields.some((c) => CRITICAL_DROP_ROW_COLUMNS.includes(c as keyof InvoiceRecord))

  return {
    record: out,
    dropRow,
    corruptedFields,
  }
}

/** Net amount bytes for fingerprint only */
function netAmountFingerprint(raw: string | null | undefined): string {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? String(n) : '0'
}

/** Stable fingerprint for collapsing duplicate UPS charge lines */
export function chargeLineDedupeKey(rec: InvoiceRecord): string {
  const pieces = [
    (rec['Invoice Number'] ?? '').trim().toUpperCase(),
    (rec['Account Number'] ?? '').trim().toUpperCase(),
    (rec['Invoice Date'] ?? '').trim(),
    (rec['Transaction Date'] ?? '').trim(),
    (rec['Lead Shipment Number'] ?? '').trim().toUpperCase(),
    (rec['Tracking Number'] ?? '').trim().toUpperCase(),
    (rec['Shipment Reference Number 1'] ?? '').trim().toUpperCase(),
    (rec['Charge Description'] ?? '').trim().toUpperCase(),
    (rec['Charge Classification Code'] ?? '').trim().toUpperCase(),
    (rec['Charge Category Code'] ?? '').trim().toUpperCase(),
    String(netAmountFingerprint(rec['Net Amount'])),
  ]
  return pieces.join('\u241e')
}

export function dedupeInvoiceRecordsStableOrder(
  records: InvoiceRecord[]
): { records: InvoiceRecord[]; duplicatesDropped: number } {
  const seen = new Set<string>()
  const out: InvoiceRecord[] = []
  let duplicatesDropped = 0
  for (const rec of records) {
    const k = chargeLineDedupeKey(rec)
    if (!k.replace(/\u241e/g, '').trim()) {
      out.push(rec)
      continue
    }
    if (seen.has(k)) {
      duplicatesDropped++
      continue
    }
    seen.add(k)
    out.push(rec)
  }
  return { records: out, duplicatesDropped }
}

/** Like dedupeInvoiceRecordsStableOrder but preserves upload id for invoice_rows sync. */
export function dedupeTaggedInvoiceRecordsStableOrder(
  tagged: ReadonlyArray<{ record: InvoiceRecord; uploadId: string }>
): {
  tagged: Array<{ record: InvoiceRecord; uploadId: string }>
  duplicatesDropped: number
} {
  const seen = new Set<string>()
  const out: Array<{ record: InvoiceRecord; uploadId: string }> = []
  let duplicatesDropped = 0
  for (const item of tagged) {
    const k = chargeLineDedupeKey(item.record)
    if (!k.replace(/\u241e/g, '').trim()) {
      out.push(item)
      continue
    }
    if (seen.has(k)) {
      duplicatesDropped++
      continue
    }
    seen.add(k)
    out.push(item)
  }
  return { tagged: out, duplicatesDropped }
}

export type DedupedInvoiceUploadRow = {
  id: string
  csv_text: string | null
  created_at: string
  content_sha256?: string | null
}

export function dedupeInvoiceUploadRowsBySha256(uploads: DedupedInvoiceUploadRow[]): {
  uploadsDeduped: DedupedInvoiceUploadRow[]
  duplicateUploadRowsSkipped: number
} {
  const seenHashes = new Set<string>()
  const uploadsDeduped: DedupedInvoiceUploadRow[] = []
  let duplicateUploadRowsSkipped = 0
  for (const u of uploads) {
    const h = String(u.content_sha256 ?? '').trim()
    if (!h.length) {
      uploadsDeduped.push(u)
      continue
    }
    if (seenHashes.has(h)) {
      duplicateUploadRowsSkipped++
      continue
    }
    seenHashes.add(h)
    uploadsDeduped.push(u)
  }
  return { uploadsDeduped, duplicateUploadRowsSkipped }
}

export function finalizeParsedInvoiceRecords(mapped: InvoiceRecord[]): {
  records: InvoiceRecord[]
  rowsDroppedCriticalSciCorruption: number
} {
  let rowsDroppedCriticalSciCorruption = 0
  const records: InvoiceRecord[] = []
  for (const rec of mapped) {
    const { record, dropRow } = sanitizeInvoiceRecordIdentifiers(rec)
    if (dropRow) {
      rowsDroppedCriticalSciCorruption++
      continue
    }
    records.push(record)
  }
  return { records, rowsDroppedCriticalSciCorruption }
}