/**
 * Converts UPS Zone Advisor XLS files and the daily rates XLSX into JSON
 * data files consumed by lib/pricing/.
 *
 * Usage:
 *   pnpm dlx tsx scripts/convert-ups-data.ts
 *
 * Inputs:
 *   Invoices skills/ups-plan-invoice-csv/{prefix}.xls  — one per origin prefix
 *   Invoices skills/ups-plan-invoice-csv/daily-rates-us-en.xlsx
 *
 * Outputs:
 *   lib/pricing/data/zone-charts/{prefix}.json
 *   lib/pricing/data/ups-rates.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const INPUT_DIR = path.join(ROOT, 'Invoices skills/ups-plan-invoice-csv')
const ZONE_OUT_DIR = path.join(ROOT, 'lib/pricing/data/zone-charts')
const RATES_OUT = path.join(ROOT, 'lib/pricing/data/ups-rates.json')

// ── Zone chart conversion ────────────────────────────────────────────────────

type ZoneEntry = {
  ground: number | null
  '3day': number | null
  '2day': number | null
  nda_saver: number | null
  nda: number | null
}

type ZoneChart = Record<string, ZoneEntry>

function parseZoneCode(raw: string): number | null {
  const t = raw.trim()
  if (!t || t === '-') return null
  const n = parseInt(t, 10)
  return isNaN(n) ? null : n
}

function convertZoneXls(filePath: string): ZoneChart {
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const csv = XLSX.utils.sheet_to_csv(ws)
  const rows = csv.split('\n')

  const headerIdx = rows.findIndex(r => r.startsWith('Dest. ZIP'))
  if (headerIdx === -1) throw new Error(`No header row found in ${filePath}`)

  const chart: ZoneChart = {}
  for (const row of rows.slice(headerIdx + 1)) {
    const cols = row.split(',')
    const dest = (cols[0] ?? '').trim()
    if (!/^\d{3}$/.test(dest)) continue

    chart[dest] = {
      ground:    parseZoneCode(cols[1] ?? ''),
      '3day':    parseZoneCode(cols[2] ?? ''),
      '2day':    parseZoneCode(cols[3] ?? ''),
      nda_saver: parseZoneCode(cols[5] ?? ''),
      nda:       parseZoneCode(cols[6] ?? ''),
    }
  }
  return chart
}

// ── Rate table conversion ────────────────────────────────────────────────────

// weight (lb) → zone code → rate ($)
type ServiceRates = Record<number, Record<number, number>>

type AllRates = {
  ground: ServiceRates
  '3day': ServiceRates
  '2day': ServiceRates
  nda_saver: ServiceRates
  nda: ServiceRates
}

async function parseRateSheet(
  wb: ExcelJS.Workbook,
  sheetName: string
): Promise<ServiceRates> {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`)

  let zonesRow = -1
  for (let r = 1; r <= 25; r++) {
    if (ws.getRow(r).getCell(2).text.trim().toLowerCase() === 'zones') {
      zonesRow = r
      break
    }
  }
  if (zonesRow === -1) throw new Error(`No zones row in ${sheetName}`)

  const zRow = ws.getRow(zonesRow)
  const zones: number[] = []
  for (let c = 3; c <= 25; c++) {
    const v = zRow.getCell(c).text.trim()
    if (!v) break
    zones.push(parseInt(v, 10))
  }

  const rates: ServiceRates = {}
  for (let r = zonesRow + 1; r <= zonesRow + 300; r++) {
    const wtRaw = ws.getRow(r).getCell(2).text.trim()
    if (!wtRaw) continue
    const wt = parseFloat(wtRaw.replace(/[^0-9.]/g, ''))
    if (isNaN(wt)) continue

    rates[wt] = {}
    zones.forEach((zone, i) => {
      const v = parseFloat(ws.getRow(r).getCell(3 + i).text.replace(/[^0-9.]/g, ''))
      if (!isNaN(v)) rates[wt]![zone] = v
    })
  }
  return rates
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(ZONE_OUT_DIR, { recursive: true })

  // 1. Convert all zone chart XLS files
  const xlsFiles = fs.readdirSync(INPUT_DIR)
    .filter(f => /^\d{3}\.xls$/.test(f))
    .sort()

  console.log(`Converting ${xlsFiles.length} zone chart files...`)
  for (const file of xlsFiles) {
    const prefix = file.replace('.xls', '')
    const chart = convertZoneXls(path.join(INPUT_DIR, file))
    const outPath = path.join(ZONE_OUT_DIR, `${prefix}.json`)
    fs.writeFileSync(outPath, JSON.stringify(chart, null, 2))
    console.log(`  ✓ ${file} → zone-charts/${prefix}.json (${Object.keys(chart).length} dest prefixes)`)
  }

  // 2. Convert rate tables
  console.log('\nConverting rate tables from daily-rates-us-en.xlsx...')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(INPUT_DIR, 'daily-rates-us-en.xlsx'))

  const allRates: AllRates = {
    ground:    await parseRateSheet(wb, 'UPS Ground'),
    '3day':    await parseRateSheet(wb, 'UPS 3DA Select'),
    '2day':    await parseRateSheet(wb, 'UPS 2DA'),
    nda_saver: await parseRateSheet(wb, 'UPS NDA Saver'),
    nda:       await parseRateSheet(wb, 'UPS NDA'),
  }

  const weightCounts = Object.entries(allRates).map(
    ([svc, r]) => `${svc}: ${Object.keys(r).length} weights`
  )
  console.log(`  ✓ ups-rates.json (${weightCounts.join(', ')})`)
  fs.writeFileSync(RATES_OUT, JSON.stringify(allRates, null, 2))

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
