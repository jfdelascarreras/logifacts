/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/**
 * Excel workbook for Premium Analysis (invoice_uploads aggregate).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJSMod = (() => {
  try {
    return require('exceljs')
  } catch {
    return null
  }
})()

import type { InvoiceAnalysisFilters, InvoiceAnalysisSummary } from '@/lib/invoices/analysis-summary'
import { normalizeMappingText } from '@/lib/invoices/analysis-summary'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import { toNumber } from '@/lib/invoices/csv'

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

function numFmt(ws: any, colIndex: number, fmt = '#,##0') {
  ws.getColumn(colIndex).numFmt = fmt
}

export async function generatePremiumAnalysisExcel(options: {
  summary: InvoiceAnalysisSummary
  appliedFilters?: InvoiceAnalysisFilters | null
  uploadsAnalyzed: number
  records?: InvoiceRecord[]
  mappingLookup?: Map<
    string,
    {
      transportation_mode: string
      category_1: string
      category_2: string
      category_3: string
      category_4: string
      category_5: string
    }
  >
}): Promise<Buffer> {
  if (!ExcelJSMod) throw new Error('ExcelJS not installed. Run: pnpm add exceljs')

  const { summary, appliedFilters, uploadsAnalyzed, records, mappingLookup } = options
  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = 'Logifacts'
  workbook.created = new Date()

  // --- Sheet 1: KPI Summary ---
  const kpi = workbook.addWorksheet('KPI Summary', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(kpi, ['Metric', 'Value'])
  const m = summary.measures
  const t = summary.totals
  const filterNote =
    appliedFilters && Object.keys(appliedFilters).length > 0
      ? JSON.stringify(appliedFilters)
      : '(none — full dataset)'
  const kpiRows: [string, string | number][] = [
    ['Uploads aggregated', uploadsAnalyzed],
    ['Total rows (charge lines)', summary.totalRows],
    ['Total cost (Net Amount)', m.totalCost],
    ['Fuel cost', m.fuelCost],
    ['Accessorials cost', m.costAccessorials ?? 0],
    ['Surcharges cost', m.costSurcharges],
    ['Total packages (deduped)', m.totalPackages],
    ['Shipment keys (deduped)', m.packageDedupeShipmentCount ?? 0],
    ['Weight gap (billed − entered lbs)', m.weightGap],
    ['Sum Net Amount (totals)', t.netAmount],
    ['Sum Invoice Amount', t.invoiceAmount],
    ['Sum Duty Amount', t.dutyAmount],
    ['Applied filters', filterNote],
  ]
  kpiRows.forEach(([label, val]) => kpi.addRow([label, val]))

  // --- Monthly ---
  const monthly = workbook.addWorksheet('Monthly Spend', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(monthly, ['Month', 'Total Cost', 'Fuel', 'Accessorials', 'Surcharges'])
  for (const row of summary.monthlySpend ?? []) {
    monthly.addRow([
      row.month,
      row.totalCost,
      row.costFuel ?? 0,
      row.costAccessorials ?? 0,
      row.costSurcharges ?? 0,
    ])
  }
  ;[2, 3, 4, 5].forEach((c) => moneyFmt(monthly, c))

  // --- Spend by Invoice ---
  const invSheet = workbook.addWorksheet('Spend by Invoice', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(invSheet, [
    'Account',
    'Invoice Number',
    'Invoice Date',
    'Total Cost',
    'Fuel',
    'Accessorials',
    'Surcharges',
  ])
  for (const row of summary.spendByInvoice ?? []) {
    invSheet.addRow([
      row.accountNumber,
      row.invoiceNumber,
      row.invoiceDate ?? '',
      row.totalCost,
      row.costFuel,
      row.costAccessorials,
      row.costSurcharges,
    ])
  }
  ;[4, 5, 6, 7].forEach((c) => moneyFmt(invSheet, c))

  // --- Daily ---
  const daily = workbook.addWorksheet('Daily Spend', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(daily, ['Date', 'Total Cost', 'Fuel', 'Accessorials', 'Surcharges'])
  for (const row of summary.dailySpend ?? []) {
    daily.addRow([row.date, row.totalCost, row.costFuel, row.costAccessorials, row.costSurcharges])
  }
  ;[2, 3, 4, 5].forEach((c) => moneyFmt(daily, c))

  // --- Daily by Account ---
  const dAcc = workbook.addWorksheet('Daily by Account', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(dAcc, ['Date', 'Account', 'Total Cost', 'Fuel', 'Accessorials', 'Surcharges'])
  for (const row of summary.dailySpendByAccount ?? []) {
    dAcc.addRow([
      row.date,
      row.accountNumber,
      row.totalCost,
      row.costFuel,
      row.costAccessorials,
      row.costSurcharges,
    ])
  }
  ;[3, 4, 5, 6].forEach((c) => moneyFmt(dAcc, c))

  // --- Category 2 ---
  const c2 = workbook.addWorksheet('Category 2 CPP', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(c2, ['Category 2', 'Total Volume', 'Total CPP', 'Total Cost'])
  for (const row of summary.category2VolumeCpp ?? []) {
    c2.addRow([row.category2, row.totalVolume, row.totalCpp, row.totalCost])
  }
  numFmt(c2, 2)
  moneyFmt(c2, 3)
  moneyFmt(c2, 4)

  // --- Mode ---
  const modeWs = workbook.addWorksheet('Mode CPP', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(modeWs, ['Mode', 'Total Volume', 'Total CPP', 'Total Cost'])
  for (const row of summary.modeVolumeCpp ?? []) {
    modeWs.addRow([row.mode, row.totalVolume, row.totalCpp, row.totalCost])
  }
  numFmt(modeWs, 2)
  moneyFmt(modeWs, 3)
  moneyFmt(modeWs, 4)

  // --- Weight buckets ---
  const wbuck = workbook.addWorksheet('Weight Buckets', { views: [{ state: 'frozen', ySplit: 1 }] })
  addHeaderRow(wbuck, ['Bucket', 'Sort', 'Volume', 'Cost', 'CPP'])
  for (const row of summary.weightBucketVolume ?? []) {
    wbuck.addRow([row.weightBucket, row.sort, row.totalVolume, row.totalCost, row.totalCpp])
  }
  moneyFmt(wbuck, 4)
  moneyFmt(wbuck, 5)

  // --- Charge lines (filtered slice) ---
  if (records?.length && mappingLookup) {
    const detail = workbook.addWorksheet('Charge Lines', { views: [{ state: 'frozen', ySplit: 1 }] })
    const headers = [
      'Invoice Date',
      'Invoice Number',
      'Account Number',
      'Tracking Number',
      'Net Amount',
      'Package Quantity',
      'Charge Description',
      'Charge Classification Code',
      'Charge Category Code',
      'Transportation Mode',
      'Category 1',
      'Category 2',
      'Category 3',
      'Category 4',
      'Category 5',
    ]
    addHeaderRow(detail, headers)
    for (const rec of records) {
      const chargeDesc = (rec['Charge Description'] ?? '').trim()
      const map = mappingLookup.get(normalizeMappingText(chargeDesc))
      detail.addRow([
        rec['Invoice Date'] ?? '',
        rec['Invoice Number'] ?? '',
        rec['Account Number'] ?? '',
        rec['Tracking Number'] ?? '',
        toNumber(rec['Net Amount']),
        toNumber(rec['Package Quantity']),
        chargeDesc,
        (rec['Charge Classification Code'] ?? '').trim(),
        (rec['Charge Category Code'] ?? '').trim(),
        map?.transportation_mode ?? '',
        map?.category_1 ?? '',
        map?.category_2 ?? '',
        map?.category_3 ?? '',
        map?.category_4 ?? '',
        map?.category_5 ?? '',
      ])
    }
    moneyFmt(detail, 5)
    numFmt(detail, 6, '#,##0')
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}
