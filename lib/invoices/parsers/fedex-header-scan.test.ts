import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { legacyXlsBufferToXlsxBuffer } from '@/lib/invoices/fixtures/legacy-xls-as-xlsx-buffer'
import { excelCellStr } from '@/lib/invoices/parsers/excel-row'
import { FEDEX_STANDARD_COLUMN_INDICES } from '@/lib/invoices/parsers/fedex'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEDEX_FIXTURE = path.join(
  __dirname,
  '../../../Invoices skills/FedEx Invoice Example/FedEx_invoice_8-694-83570.XLS'
)

describe('FedEx standard column indices', () => {
  it('matches golden fixture header layout', async () => {
    const raw = fs.readFileSync(FEDEX_FIXTURE)
    const xlsxBuf = legacyXlsBufferToXlsxBuffer(raw)
    const workbook = new ExcelJS.Workbook()
    // @ts-expect-error exceljs Buffer typing
    await workbook.xlsx.load(xlsxBuf)
    const row = workbook.worksheets[0]!.getRow(1)

    expect(excelCellStr(row, FEDEX_STANDARD_COLUMN_INDICES.billToAccount)).toMatch(/bill to account/i)
    expect(excelCellStr(row, FEDEX_STANDARD_COLUMN_INDICES.actualWeight)).toMatch(/actual weight amount/i)
    expect(excelCellStr(row, FEDEX_STANDARD_COLUMN_INDICES.ratedWeight)).toMatch(/rated weight amount/i)
    expect(excelCellStr(row, FEDEX_STANDARD_COLUMN_INDICES.numberOfPieces)).toMatch(/number of pieces/i)
    expect(excelCellStr(row, FEDEX_STANDARD_COLUMN_INDICES.zoneCode)).toMatch(/zone code/i)
  })
})
