/**
 * Content-based carrier detection from a file buffer.
 *
 * Strategy:
 *  1. CSV (non-Excel magic bytes) → UPS  (the only carrier using CSV in this system)
 *  2. Excel → inspect row-1 headers of the first worksheet:
 *       • "Tracking ID Charge Description" anywhere in cols 0-250 → FedEx
 *       • "Airbill" anywhere in row 1                             → WWE
 *       • Neither → fall back to filename heuristics
 *  3. Filename fallback: keywords 'fedex'/'fdx' or 'wwe'/'worldwide'
 *  4. Still unknown → carrier: null (caller surfaces a helpful error)
 *
 * The filename fallback preserves backward-compatibility for files whose
 * headers aren't loaded (e.g. malformed workbooks) or whose col layout
 * changes in future carrier formats.
 */
import type { Carrier } from '@/types/invoice'

import { loadExcelWorkbook } from './excel-load'
import { excelCellStr } from './excel-row'

// ── Signature regexes ────────────────────────────────────────────────────────

/** Unique to FedEx invoices — appears in row 1 around col 107. */
const FEDEX_HEADER_RE = /tracking\s*id\s*charge\s*description/i

/** Unique to WWE (World Wide Express) invoices — appears in row 1 col 3. */
const WWE_HEADER_RE = /airbill/i

// ── Helpers ──────────────────────────────────────────────────────────────────

/** True when the buffer starts with XLSX (PK) or legacy XLS (D0CF) magic bytes. */
export function isExcelBuffer(buffer: Buffer): boolean {
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
  const isXls  = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
  return isXlsx || isXls
}

/**
 * Open the first worksheet and scan row 1 for carrier-specific header markers.
 * Returns 'FedEx', 'WWE', or null when neither marker is found.
 */
async function detectExcelCarrier(buffer: Buffer): Promise<'FedEx' | 'WWE' | null> {
  try {
    const wb = await loadExcelWorkbook(buffer)
    const ws = wb.worksheets[0]
    if (!ws) return null

    const headerRow = ws.getRow(1)
    const scanEnd = Math.min(ws.columnCount ?? 220, 250)

    let hasFedEx = false
    let hasWWE = false

    for (let c = 0; c < scanEnd; c++) {
      const val = excelCellStr(headerRow, c)
      if (!val) continue
      if (FEDEX_HEADER_RE.test(val)) { hasFedEx = true; break }
      if (WWE_HEADER_RE.test(val)) hasWWE = true
    }

    if (hasFedEx) return 'FedEx'
    if (hasWWE) return 'WWE'
    return null
  } catch {
    return null
  }
}

/** Filename keyword fallback — same logic as the original detectCarrier(). */
function detectCarrierFromFilename(filename: string): Carrier | null {
  const name = filename.toLowerCase()
  if (name.includes('wwe') || name.includes('worldwide') || name.includes('world_wide')) return 'WWE'
  if (name.includes('fedex') || name.includes('fdx')) return 'FedEx'
  return null
}

// ── Public API ───────────────────────────────────────────────────────────────

export type CarrierDetectionResult =
  | { carrier: Carrier;  isExcel: boolean; method: 'csv' | 'content' | 'filename' }
  | { carrier: null;     isExcel: true;    method: 'unknown' }

/**
 * Detect carrier from file content with a filename keyword fallback.
 *
 * - CSV buffer  → always UPS (no other carrier sends CSV)
 * - Excel buffer → header scan → filename heuristic → null (unknown)
 */
export async function detectCarrierFromBuffer(
  filename: string,
  buffer: Buffer,
): Promise<CarrierDetectionResult> {
  const isExcel = isExcelBuffer(buffer)

  if (!isExcel) {
    return { carrier: 'UPS', isExcel: false, method: 'csv' }
  }

  // Excel: content-based detection first (filename-independent)
  const fromContent = await detectExcelCarrier(buffer)
  if (fromContent) return { carrier: fromContent, isExcel: true, method: 'content' }

  // Excel: filename keyword fallback
  const fromFilename = detectCarrierFromFilename(filename)
  if (fromFilename) return { carrier: fromFilename, isExcel: true, method: 'filename' }

  // Excel format recognised neither as FedEx nor WWE
  return { carrier: null, isExcel: true, method: 'unknown' }
}
