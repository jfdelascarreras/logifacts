/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Excel export via ExcelJS.
 * Three sheets:
 *   1. Mapped Lines    — all invoice_lines with mapped = true
 *   2. Summary Pivot   — total charge_amount grouped by standardized_charge
 *   3. Unmatched       — invoice_lines with mapped = false
 *
 * Requires: pnpm add exceljs
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJSMod = (() => { try { return require('exceljs') } catch { return null } })()
import type { InvoiceLine } from '@/types/invoice'

function addHeaderRow(ws: any, columns: string[]) {
  const row = ws.addRow(columns)
  row.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12284B' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 20
}

const LINE_COLUMNS = [
  'carrier', 'charge_description', 'standardized_charge',
  'category_1', 'category_2', 'category_3', 'category_4', 'category_5',
  'transportation_mode', 'charge_amount', 'shipment_date',
  'zone', 'destination_state', 'service_level', 'reference_1', 'mapped',
]

export async function generateInvoiceExcel(lines: InvoiceLine[]): Promise<Buffer> {
  if (!ExcelJSMod) throw new Error('ExcelJS not installed. Run: pnpm add exceljs')
  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = 'Logifacts'
  workbook.created = new Date()

  // Sheet 1: Mapped Lines
  const mappedSheet = workbook.addWorksheet('Mapped Lines')
  mappedSheet.columns = LINE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === 'charge_description' ? 45 : key.startsWith('category') ? 20 : 18,
  }))
  addHeaderRow(mappedSheet, LINE_COLUMNS.map((k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())))
  // replace header row added by columns init with styled one
  mappedSheet.spliceRows(1, 1)

  const mapped = lines.filter((l) => l.mapped)
  mapped.forEach((line) => mappedSheet.addRow(LINE_COLUMNS.map((k) => (line as unknown as Record<string, unknown>)[k] ?? '')))

  // Sheet 2: Summary Pivot
  const summarySheet = workbook.addWorksheet('Summary by Charge')
  summarySheet.columns = [
    { header: 'Standardized Charge', key: 'standardized_charge', width: 35 },
    { header: 'Category 1', key: 'category_1', width: 22 },
    { header: 'Category 2', key: 'category_2', width: 22 },
    { header: 'Total Amount', key: 'total_amount', width: 18 },
    { header: 'Line Count', key: 'count', width: 14 },
  ]
  summarySheet.spliceRows(1, 1)
  addHeaderRow(summarySheet, ['Standardized Charge', 'Category 1', 'Category 2', 'Total Amount', 'Line Count'])

  const pivotMap = new Map<string, { category_1: string; category_2: string; total: number; count: number }>()
  for (const line of lines) {
    const key = line.standardized_charge ?? line.charge_description
    const existing = pivotMap.get(key)
    if (existing) {
      existing.total += line.charge_amount
      existing.count += 1
    } else {
      pivotMap.set(key, {
        category_1: line.category_1 ?? '',
        category_2: line.category_2 ?? '',
        total: line.charge_amount,
        count: 1,
      })
    }
  }

  Array.from(pivotMap.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .forEach(([key, v]) => {
      summarySheet.addRow([key, v.category_1, v.category_2, v.total, v.count])
    })

  // Sheet 3: Unmatched
  const unmatchedSheet = workbook.addWorksheet('Unmatched Charges')
  unmatchedSheet.columns = LINE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === 'charge_description' ? 45 : 18,
  }))
  unmatchedSheet.spliceRows(1, 1)
  addHeaderRow(unmatchedSheet, LINE_COLUMNS.map((k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())))

  const unmatched = lines.filter((l) => !l.mapped)
  unmatched.forEach((line) => unmatchedSheet.addRow(LINE_COLUMNS.map((k) => (line as unknown as Record<string, unknown>)[k] ?? '')))

  // Format charge_amount columns as currency
  ;[mappedSheet, unmatchedSheet].forEach((ws: any) => { ws.getColumn('charge_amount').numFmt = '$#,##0.00' })
  summarySheet.getColumn('total_amount').numFmt = '$#,##0.00'

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}
