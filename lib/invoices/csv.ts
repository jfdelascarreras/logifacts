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

/**
 * Detect whether a CSV line uses semicolon or comma as its delimiter.
 * Counts raw occurrences outside of quoted regions. UPS invoice exports
 * use semicolons; Excel re-exports often use commas.
 */
export function detectCsvDelimiter(line: string): ',' | ';' {
  let inQuotes = false
  let commas = 0
  let semis = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { i++ } else { inQuotes = !inQuotes }
    } else if (!inQuotes) {
      if (ch === ',') commas++
      else if (ch === ';') semis++
    }
  }
  return semis >= commas ? ';' : ','
}

/** Split one CSV line respecting quoted fields and escaped double-quotes (""). */
export function splitCsvLine(line: string, delimiter: ',' | ';' = ','): string[] {
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
    } else if (ch === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }

  result.push(current)
  return result
}

export function mapLineToInvoiceRecord(line: string, delimiter: ',' | ';' = ','): InvoiceRecord {
  const cols = splitCsvLine(line, delimiter)
  const record: Partial<InvoiceRecord> = {}

  INVOICE_HEADERS.forEach((name, index) => {
    const raw = cols[index]
    record[name] = raw !== undefined ? raw.trim() : null
  })

  return record as InvoiceRecord
}

export function parseInvoiceCsvText(csvText: string): InvoiceRecord[] {
  // Strip UTF-8 BOM (utf-8-sig encoding used by some UPS exports and Excel).
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  // Auto-detect delimiter from the first line (UPS native = semicolon, Excel re-export = comma).
  const delimiter = detectCsvDelimiter(lines[0])

  // Some invoice exports may unexpectedly include a header row.
  // Skip it when it clearly matches known header names.
  const firstCols = splitCsvLine(lines[0], delimiter).map((v) => v.trim().toLowerCase())
  const hasHeaderLikeRow =
    firstCols.includes('version') &&
    firstCols.includes('invoice number') &&
    firstCols.includes('charge description')

  let dataLines = hasHeaderLikeRow ? lines.slice(1) : lines
  // If stripping a mistaken "header" left nothing, fall back to all lines.
  if (dataLines.length === 0 && lines.length > 0) {
    dataLines = lines
  }
  return dataLines.map((line) => mapLineToInvoiceRecord(line, delimiter))
}

/**
 * Normalises an account-number string that Excel may have corrupted by auto-formatting
 * a large integer as scientific notation (e.g. "3.76E+76").
 *
 * - If the value is scientific notation AND the resulting integer fits within
 *   JavaScript's safe-integer range, it is converted back to a plain digit string
 *   (lossless round-trip).
 * - If the exponent is too large for a safe integer (i.e. precision was already
 *   truncated by Excel), the original string is returned unchanged — the original
 *   digits cannot be recovered.
 * - Non-scientific strings are returned as-is.
 */
export function normalizeAccountNumberString(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return s
  // Only attempt conversion for pure scientific-notation patterns (digits, optional dot, e/E, optional sign, digits)
  if (!/^[+-]?\d+\.?\d*[eE][+\-]?\d+$/.test(s)) return s
  const n = Number(s)
  if (!Number.isFinite(n) || !Number.isInteger(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return s
  return String(Math.round(n))
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

