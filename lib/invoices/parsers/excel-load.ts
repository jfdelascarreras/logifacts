/**
 * Unified Excel workbook loader — handles both XLSX and legacy XLS (BIFF8).
 *
 * ExcelJS's `workbook.xlsx.load()` only accepts XLSX (ZIP/PK magic bytes).
 * Uploading a true `.xls` file (Compound Document, D0CF11E0 magic bytes) throws:
 *   "Can't find end of central directory : is this a zip file?"
 *
 * Fix: detect the format from magic bytes. If BIFF/XLS → convert to XLSX in-memory
 * using SheetJS (already a project dependency), then hand the XLSX buffer to ExcelJS.
 * This keeps all existing ExcelJS row-iteration logic unchanged.
 */
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

/** True when buffer starts with the legacy Compound Document (BIFF/XLS) magic bytes. */
function isLegacyXls(buffer: Buffer): boolean {
  return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
}

/**
 * Convert a legacy .xls buffer to .xlsx using SheetJS, preserving cell values.
 * SheetJS handles BIFF5/BIFF8 (Excel 95–2003) and returns a XLSX buffer that
 * ExcelJS can then load normally.
 */
function xlsToXlsx(buffer: Buffer): Buffer {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const out: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return Buffer.from(out)
}

/**
 * Load an Excel buffer (XLS or XLSX) into an ExcelJS Workbook.
 *
 * Usage — replace every `workbook.xlsx.load(buffer)` call with:
 *   `await loadExcelWorkbook(buffer)`
 */
export async function loadExcelWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const normalized = isLegacyXls(buffer) ? xlsToXlsx(buffer) : buffer
  // @ts-expect-error — exceljs Buffer type lags Node generics
  await wb.xlsx.load(normalized)
  return wb
}
