import { INVOICE_HEADERS } from './headers'
import { finalizeParsedInvoiceRecords } from './identifier-safety'

export { INVOICE_HEADERS }

export type InvoiceRecord = Record<(typeof INVOICE_HEADERS)[number], string | null>

/**
 * Mirrors `invoiceCarrierPremiumKey` in analysis-summary (avoid circular imports).
 * Blank carrier defaults to UPS — matches mapping resolution behavior.
 */
function premiumCarrierKeyFromRecord(rec: InvoiceRecord): 'UPS' | 'FEDEX' | 'WWE' | string {
  const k = String(rec['Carrier Name'] ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
  const norm = k === '' ? 'UPS' : k
  if (norm === 'UPS') return 'UPS'
  if (norm.includes('FED')) return 'FEDEX'
  if (norm.includes('WORLD') || norm === 'WWE' || norm.includes('WWE')) return 'WWE'
  return norm
}

/** True when the cell is empty or repeats its column header (embedded CSV header row). */
function hasRealDateValue(column: keyof InvoiceRecord, rec: InvoiceRecord): boolean {
  const headerLabel = column as string
  const v = String(rec[column] ?? '').trim()
  return v !== '' && v !== headerLabel
}

/** UPS Club Colors Power Query: Invoice Date must be populated and not a header echo. */
function passesUpsClubColorsDateGate(rec: InvoiceRecord): boolean {
  return hasRealDateValue('Invoice Date', rec)
}

/**
 * FedEx/WWE layouts and some consolidated exports often bill by Transaction / Shipment date
 * while leaving Invoice Date blank — still valid detail rows in the same 250-column shape.
 */
const NON_UPS_DATE_COLUMNS: (keyof InvoiceRecord)[] = [
  'Invoice Date',
  'Transaction Date',
  'Shipment Date',
]

function passesNonUpsClubColorsDateGate(rec: InvoiceRecord): boolean {
  return NON_UPS_DATE_COLUMNS.some((col) => hasRealDateValue(col, rec))
}

/**
 * Raw date cell for Premium Analysis rollups and dashboard date filters.
 * FedEx/WWE: first non-empty among Invoice Date → Transaction Date → Shipment Date (excluding header echoes).
 * UPS and other carriers: Invoice Date only (Club Colors).
 */
export function primaryRollupDateRaw(rec: InvoiceRecord): string | null {
  const carrier = premiumCarrierKeyFromRecord(rec)
  if (carrier === 'FEDEX' || carrier === 'WWE') {
    for (const col of NON_UPS_DATE_COLUMNS) {
      if (hasRealDateValue(col, rec)) return String(rec[col] ?? '').trim()
    }
    return null
  }
  if (!hasRealDateValue('Invoice Date', rec)) return null
  return String(rec['Invoice Date'] ?? '').trim()
}

/**
 * Aligns with Power Query steps 7 + 9 (Club Colors): drop embedded headers / spacer rows.
 * UPS: requires **Invoice Date** (Club Colors behavior).
 * FedEx / WWE: keep rows when **any** of Invoice Date, Transaction Date, or Shipment Date
 * carries a real value (non-empty and not a repeated header label).
 */
export function filterRowsLikeClubColorsPowerQuery(records: InvoiceRecord[]): InvoiceRecord[] {
  return records.filter((rec) => {
    const carrier = premiumCarrierKeyFromRecord(rec)
    if (carrier === 'FEDEX' || carrier === 'WWE') {
      return passesNonUpsClubColorsDateGate(rec)
    }
    return passesUpsClubColorsDateGate(rec)
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

export function rawLinesToInvoiceRecords(lines: readonly string[]): InvoiceRecord[] {
  if (lines.length === 0) return []

  // UPS native exports use semicolons; Excel re-exports often use commas.
  const delimiter = detectCsvDelimiter(lines[0])
  const firstCols = splitCsvLine(lines[0], delimiter).map((v) => v.trim().toLowerCase())
  const hasHeaderLikeRow =
    firstCols.includes('version') &&
    firstCols.includes('invoice number') &&
    firstCols.includes('charge description')

  let dataLines = hasHeaderLikeRow ? lines.slice(1) : lines
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

/** Same output as parsing + SCI identifier cleanup + dropping unrecoverable critical-ID rows */
export function parseInvoiceCsvDocument(csvText: string): {
  records: InvoiceRecord[]
  rowsDroppedCriticalSciCorruption: number
} {
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0)
  const mapped = rawLinesToInvoiceRecords(lines)
  return finalizeParsedInvoiceRecords(mapped)
}

export function parseInvoiceCsvText(csvText: string): InvoiceRecord[] {
  return parseInvoiceCsvDocument(csvText).records
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

