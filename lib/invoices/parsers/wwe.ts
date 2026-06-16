/**
 * World Wide Express (WWE) XLS invoice parser.
 *
 * Up to 8 Charge Type / Charge Amount pairs per row — must unpivot before joining.
 * Physical carrier is UPS (SCAC col 7 = 'UPS') but ingest carrier is WWE.
 */
import ExcelJS from 'exceljs'

import { identifierLooksScientificNotationCorrupted } from '../identifier-safety'
import { loadExcelWorkbook } from './excel-load'
import type { ParsedInvoiceLine } from './types'
import { excelCellRawNum, excelCellStr } from './excel-row'

const CHARGE_TYPE_COLS = [39, 41, 43, 45, 47, 49, 51, 53] as const
const CHARGE_AMT_COLS = [40, 42, 44, 46, 48, 50, 52, 54] as const

export type WWEWorksheetParseResult = {
  lines: ParsedInvoiceLine[]
  /** Detail rows counted as shipments (same row guards as unpivot; excludes header). */
  shipmentDetailRows: number
}

export function parseWWEWorksheet(ws: ExcelJS.Worksheet | undefined): WWEWorksheetParseResult {
  if (!ws) return { lines: [], shipmentDetailRows: 0 }

  const results: ParsedInvoiceLine[] = []
  let shipmentDetailRows = 0

  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return

    const invoiceNumber = excelCellStr(row, 1)
    const airbill = excelCellStr(row, 3)
    const shipDate = excelCellStr(row, 4)
    const invoiceDate = excelCellStr(row, 56)
    const receiverState = excelCellStr(row, 21)
    const serviceLevel = excelCellStr(row, 62)
    const zone = excelCellStr(row, 63)

    if ((!invoiceDate || !invoiceDate.trim()) && (!shipDate || !shipDate.trim())) return

    if (identifierLooksScientificNotationCorrupted(invoiceNumber)) return

    /** Package shipments carry UPS tracking numbers in Airbill # (column D); invoice-level rows use refs like `INV…`. */
    if (/^1Z[A-Z0-9]/i.test(airbill)) shipmentDetailRows += 1

    for (let i = 0; i < CHARGE_TYPE_COLS.length; i++) {
      const chargeType = excelCellStr(row, CHARGE_TYPE_COLS[i])
      const chargeAmt = excelCellRawNum(row, CHARGE_AMT_COLS[i])
      if (!chargeType) continue
      results.push({
        charge_description: chargeType,
        charge_amount: chargeAmt,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        shipment_date: shipDate || undefined,
        zone: zone || undefined,
        destination_state: receiverState || undefined,
        service_level: serviceLevel || undefined,
        tracking_id: airbill || undefined,
        package_quantity: /^1Z[A-Z0-9]/i.test(airbill) ? 1 : undefined,
      })
    }
  })

  return { lines: results, shipmentDetailRows }
}

export async function parseWWE(blob: Uint8Array | ArrayBufferLike): Promise<ParsedInvoiceLine[]> {
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as Uint8Array)
  const workbook = await loadExcelWorkbook(buffer)
  return parseWWEWorksheet(workbook.worksheets[0]).lines
}
