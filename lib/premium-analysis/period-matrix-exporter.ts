/* eslint-disable @typescript-eslint/no-explicit-any */
const ExcelJSMod = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('exceljs')
  } catch {
    return null
  }
})()

import type { SpendShipmentPeriodMatrix } from '@/lib/premium-analysis/period-averages-matrix'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function addHeaderRow(ws: any, columns: string[]) {
  const row = ws.addRow(columns)
  row.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12284B' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 20
}

function moneyFmt(ws: any, colIndex: number) {
  ws.getColumn(colIndex).numFmt = '$#,##0.00'
}

function numFmt(ws: any, colIndex: number, fmt = '#,##0.0') {
  ws.getColumn(colIndex).numFmt = fmt
}

/** Years ascending (2025, 2026, …). */
export function sortedMatrixYears(matrix: SpendShipmentPeriodMatrix): number[] {
  return [...matrix.years].sort((a, b) => a - b)
}

function yearsWithMonthData(matrix: SpendShipmentPeriodMatrix): number[] {
  return [...new Set(matrix.byYearMonth.map((r) => r.year))].sort((a, b) => a - b)
}

function monthsWithData(matrix: SpendShipmentPeriodMatrix): number[] {
  return [...new Set(matrix.byYearMonth.map((r) => r.month))].sort((a, b) => a - b)
}

function yearsWithWeekData(matrix: SpendShipmentPeriodMatrix): number[] {
  return [...new Set(matrix.byYearWeek.map((r) => r.year))].sort((a, b) => a - b)
}

/** Append period-matrix sheets to an existing workbook. */
export function appendPeriodMatrixSheets(workbook: any, matrix: SpendShipmentPeriodMatrix): void {
  const years = sortedMatrixYears(matrix)
  if (!years.length) return

  const yearWs = workbook.addWorksheet('Avg by Year', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(yearWs, [
    'Year',
    'Total Spend',
    'Avg Spend / Day',
    'Avg Spend / Week',
    'Total Shipments',
    'Avg Shipments / Day',
    'Avg Shipments / Week',
    'Active Days',
  ])
  for (const row of [...matrix.byYear].sort((a, b) => a.year - b.year)) {
    yearWs.addRow([
      row.year,
      row.totalSpend,
      row.avgSpend,
      row.avgSpendPerWeek,
      row.totalShipments,
      row.avgShipments,
      row.avgShipmentsPerWeek,
      row.activeDays,
    ])
  }
  ;[2, 3, 4].forEach((c) => moneyFmt(yearWs, c))
  numFmt(yearWs, 5, '#,##0')
  ;[6, 7].forEach((c) => numFmt(yearWs, c))

  const monthYears = yearsWithMonthData(matrix)
  const months = monthsWithData(matrix)
  if (monthYears.length && months.length) {
    const monthWs = workbook.addWorksheet('Avg by Month', { views: [{ state: 'frozen', ySplit: 2 }] })
    const monthHeader = [
      'Month',
      ...monthYears.flatMap((y) => [`${y} Avg Spend`, `${y} Avg Shipments`]),
    ]
    addHeaderRow(monthWs, monthHeader)
    const monthLookup = new Map(
      matrix.byYearMonth.map((r) => [`${r.year}-${r.month}`, r] as const)
    )
    for (const month of months) {
      const row: (string | number)[] = [MONTH_NAMES[month - 1]!]
      for (const y of monthYears) {
        const cell = monthLookup.get(`${y}-${month}`)
        row.push(cell?.avgSpend ?? '', cell?.avgShipments ?? '')
      }
      monthWs.addRow(row)
    }
    monthYears.forEach((_, i) => {
      moneyFmt(monthWs, 2 + i * 2)
      numFmt(monthWs, 3 + i * 2)
    })
  }

  const weekYears = yearsWithWeekData(matrix)
  const weeks = [...new Set(matrix.byYearWeek.map((r) => r.weekOfYear))].sort((a, b) => a - b)
  if (weekYears.length && weeks.length) {
    const weekWs = workbook.addWorksheet('Avg by Week', { views: [{ state: 'frozen', ySplit: 2 }] })
    const weekHeader = ['Week', ...weekYears.flatMap((y) => [`${y} Avg Spend`, `${y} Avg Shipments`])]
    addHeaderRow(weekWs, weekHeader)
    const weekLookup = new Map(
      matrix.byYearWeek.map((r) => [`${r.year}-${r.weekOfYear}`, r] as const)
    )
    for (const week of weeks) {
      const row: (string | number)[] = [`W${String(week).padStart(2, '0')}`]
      for (const y of weekYears) {
        const cell = weekLookup.get(`${y}-${week}`)
        row.push(cell?.avgSpend ?? '', cell?.avgShipments ?? '')
      }
      weekWs.addRow(row)
    }
    weekYears.forEach((_, i) => {
      moneyFmt(weekWs, 2 + i * 2)
      numFmt(weekWs, 3 + i * 2)
    })
  }
}

/** Standalone workbook with only the period-matrix sheets. */
export async function generatePeriodMatrixExcel(matrix: SpendShipmentPeriodMatrix): Promise<Buffer> {
  if (!ExcelJSMod) throw new Error('ExcelJS not installed. Run: pnpm add exceljs')

  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = 'Logifacts'
  workbook.created = new Date()
  appendPeriodMatrixSheets(workbook, matrix)

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}
