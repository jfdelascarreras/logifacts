import type { Row as ExcelRow } from 'exceljs'

import { excelCellAsDisplayString } from '@/lib/invoices/excel-cell-display'

import { cleanText } from './scalars'

/**
 * Reads one cell on a workbook row (`col` zero-based: 0 → column A).
 * Values are sanitized like UPS CSV scalars (`cleanText`).
 */
export function excelCellStr(row: ExcelRow, colZeroBased: number): string {
  return cleanText(excelCellAsDisplayString(row.getCell(colZeroBased + 1)))
}

export function excelCellRawNum(row: ExcelRow, colZeroBased: number): number {
  const v = row.getCell(colZeroBased + 1).value
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isNaN(n) ? 0 : n
}
