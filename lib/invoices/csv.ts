import { INVOICE_HEADERS } from './headers'

export { INVOICE_HEADERS }

export type InvoiceRecord = Record<(typeof INVOICE_HEADERS)[number], string | null>

/** Aligns with Power Query steps 7 + 9 (Club Colors): drop embedded headers and UPS system rows. */
export function filterRowsLikeClubColorsPowerQuery(records: InvoiceRecord[]): InvoiceRecord[] {
  return records.filter((rec) => {
    const invoiceDate = (rec['Invoice Date'] ?? '').trim()
    if (invoiceDate === 'Invoice Date' || invoiceDate === '') return false
    const recipient = String(rec['Recipient Number'] ?? '').toUpperCase()
    if (recipient.includes('UPS')) return false
    return true
  })
}

/** When set, replaces UPS `Sender Company Name` so reporting matches the logged-in account. */
export function applyProfileSenderCompanyName(
  records: InvoiceRecord[],
  profileCompanyName: string | null | undefined
): InvoiceRecord[] {
  const name = String(profileCompanyName ?? '').trim()
  if (!name) return records
  return records.map((rec) => ({ ...rec, 'Sender Company Name': name }))
}

// Very small CSV splitter that understands quotes around values with commas.
export function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // toggle quotes; handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }

  result.push(current)
  return result
}

export function mapLineToInvoiceRecord(line: string): InvoiceRecord {
  const cols = splitCsvLine(line)
  const record: Partial<InvoiceRecord> = {}

  INVOICE_HEADERS.forEach((name, index) => {
    const raw = cols[index]
    record[name] = raw !== undefined ? raw.trim() : null
  })

  return record as InvoiceRecord
}

export function parseInvoiceCsvText(csvText: string): InvoiceRecord[] {
  // Strip UTF-8 BOM so the first field parses correctly (Excel / some exports).
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  // Some invoice exports may unexpectedly include a header row.
  // Skip it when it clearly matches known header names.
  const firstCols = splitCsvLine(lines[0]).map((v) => v.trim().toLowerCase())
  const hasHeaderLikeRow =
    firstCols.includes('version') &&
    firstCols.includes('invoice number') &&
    firstCols.includes('charge description')

  let dataLines = hasHeaderLikeRow ? lines.slice(1) : lines
  // If stripping a mistaken "header" left nothing, fall back to all lines.
  if (dataLines.length === 0 && lines.length > 0) {
    dataLines = lines
  }
  return dataLines.map(mapLineToInvoiceRecord)
}

// Small helpers for numeric conversions used in analysis
export function toNumber(value: string | null): number {
  if (!value) return 0

  const raw = value.trim()
  if (!raw) return 0

  // Reject clearly non-numeric values (e.g. tracking numbers, alphanumeric IDs).
  if (/[a-z]/i.test(raw)) return 0

  // Support accounting negatives like "(123.45)".
  const isParenNegative = raw.startsWith('(') && raw.endsWith(')')
  const normalized = isParenNegative ? `-${raw.slice(1, -1)}` : raw

  // Remove currency symbols/spaces/thousands separators while preserving sign/decimal.
  const cleaned = normalized.replace(/[,$\s]/g, '')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return 0

  const num = Number(cleaned)
  return Number.isFinite(num) ? num : 0
}

