import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { parseMasterMappingXlsxFromFile, resolveDefaultMasterMappingXlsxPaths } from '@/lib/invoices/excel-master-mapping'
import { normalizeChargeDescriptionForLookup } from '@/lib/invoices/mapping'
import { parseFedExWorksheet } from '@/lib/invoices/parsers/fedex'
import { parseWWEWorksheet } from '@/lib/invoices/parsers/wwe'

import { legacyXlsBufferToXlsxBuffer } from './legacy-xls-as-xlsx-buffer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')

const FEDEX_FIXTURE = path.join(
  REPO_ROOT,
  'Invoices skills/FedEx Invoice Example/FedEx_invoice_8-694-83570.XLS'
)
const WWE_FIXTURE = path.join(REPO_ROOT, 'Invoices skills/WWE Invoice Example/260308W096716.xls')

async function loadInvoiceWorkbook(absPath: string): Promise<ExcelJS.Workbook> {
  const raw = fs.readFileSync(absPath)
  const xlsxBuf = legacyXlsBufferToXlsxBuffer(raw)
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error — exceljs Buffer typing lags Node
  await workbook.xlsx.load(xlsxBuf)
  return workbook
}

async function masterMappingLookupForCarrier(carrier: 'FedEx' | 'WWE'): Promise<Map<string, boolean>> {
  const paths = await resolveDefaultMasterMappingXlsxPaths(REPO_ROOT)
  expect(paths.length, 'Master mapping workbook missing under `Invoices skills/`').toBeGreaterThan(0)
  const rows = await parseMasterMappingXlsxFromFile(paths[0]!)
  const keys = new Map<string, boolean>()
  for (const r of rows) {
    if (r.carrier !== carrier) continue
    keys.set(normalizeChargeDescriptionForLookup(r.charge_description), true)
  }
  return keys
}

function assertDescriptionsMapped(
  descriptions: Iterable<string>,
  lookup: Map<string, boolean>,
  carrier: string
): void {
  for (const desc of descriptions) {
    const key = normalizeChargeDescriptionForLookup(desc)
    expect(lookup.has(key), `${carrier}: master_mapping missing "${desc}" (normalized: ${key})`).toBe(true)
  }
}

describe('invoice unpivot fixtures (real carrier workbooks)', () => {
  it('FedEx: Tracking ID charge unpivot row count, descriptions, mapping, amount spot-check', async () => {
    const workbook = await loadInvoiceWorkbook(FEDEX_FIXTURE)
    const lines = parseFedExWorksheet(workbook.worksheets[0], { unpivotChargesOnly: true })

    expect(lines.length).toBe(12817)

    const uniq = new Set(lines.map((l) => l.charge_description))
    expect([...uniq].sort()).toMatchInlineSnapshot(`
      [
        "DAS Comm",
        "DAS Commercial",
        "DAS Extended Comm",
        "DAS Remote Comm",
        "Declared Value Charge",
        "Demand Surcharge",
        "Direct Signature Req.",
        "Discount",
        "Earned Discount",
        "Fuel Surcharge",
        "Late Fee",
        "Performance Pricing",
        "Print Return Label",
        "Residential",
        "Return On Call Surcharge",
        "Saturday Pickup",
        "Third Party Billing",
        "Weekday Delivery",
        "Weekly Service Chg",
      ]
    `)

    const lookup = await masterMappingLookupForCarrier('FedEx')
    assertDescriptionsMapped(uniq, lookup, 'FedEx')

    expect(lines.some((l) => l.charge_description === 'Fuel Surcharge' && l.charge_amount === 2.68)).toBe(true)
    expect(lines.some((l) => l.charge_description === 'Discount' && l.charge_amount < 0)).toBe(true)
  })

  const EXPECTED_WWE_UNPIVOT_UNIQ = new Set([
    'SMALL PACKAGE FREIGHT',
    'Delivery Area Surcharge Residential Extended',
    'Destination Modifier',
    'WEEKLY SERVICE CHARGE',
  ])

  it('WWE: Charge Type 1–8 unpivot counts, descriptions, mapping, amount spot-check', async () => {
    const workbook = await loadInvoiceWorkbook(WWE_FIXTURE)
    const { lines, shipmentDetailRows } = parseWWEWorksheet(workbook.worksheets[0])

    expect(shipmentDetailRows).toBe(7)
    expect(lines.length).toBe(12)

    const uniq = new Set(lines.map((l) => l.charge_description))
    expect(uniq.size).toBe(EXPECTED_WWE_UNPIVOT_UNIQ.size)
    expect([...uniq].every((d) => EXPECTED_WWE_UNPIVOT_UNIQ.has(d))).toBe(true)

    const lookup = await masterMappingLookupForCarrier('WWE')
    assertDescriptionsMapped(uniq, lookup, 'WWE')

    expect(lines.some((l) => l.charge_description === 'SMALL PACKAGE FREIGHT' && l.charge_amount === 37.31)).toBe(true)
    expect(
      lines.some(
        (l) =>
          l.charge_description === 'Delivery Area Surcharge Residential Extended' && l.charge_amount === 3.45
      )
    ).toBe(true)
  })
})
