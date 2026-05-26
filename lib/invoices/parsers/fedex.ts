/**
 * FedEx XLS invoice parser.
 *
 * Two charge sources per row:
 *  1. Service Type (col 11) → base freight row (Transportation Charge Amount, col 9)
 *  2. Up to 25 Tracking ID Charge Description / Amount pairs — anchored from the first header column
 *     titled “Tracking ID Charge Description” (fallback zero-based column 107).
 */
import ExcelJS from 'exceljs'

import { identifierLooksScientificNotationCorrupted } from '../identifier-safety'
import { loadExcelWorkbook } from './excel-load'
import type { ParsedInvoiceLine } from './types'
import { excelCellRawNum, excelCellStr } from './excel-row'

const TRACKING_CHARGE_DESC_HEADER_RE = /tracking\s*id\s*charge\s*description/i

/** Header-driven anchor so Tendered Date / MPS Package ID columns before the first pair stay unparsed. */
function fedExTrackingChargeDescStartColumn(ws: ExcelJS.Worksheet): number {
  const headerRow = ws.getRow(1)
  const scanEnd = Math.min(ws.columnCount ?? 220, 240)
  for (let c = 70; c < scanEnd; c++) {
    if (TRACKING_CHARGE_DESC_HEADER_RE.test(excelCellStr(headerRow, c))) return c
  }
  return 107
}

export type FedExParseOptions = {
  /** When true, only Tracking ID charge pairs are emitted (no base freight row). */
  unpivotChargesOnly?: boolean
}

export function parseFedExWorksheet(
  ws: ExcelJS.Worksheet | undefined,
  options?: FedExParseOptions
): ParsedInvoiceLine[] {
  if (!ws) return []

  const unpivotOnly = Boolean(options?.unpivotChargesOnly)
  const trackingPairDescStart = fedExTrackingChargeDescStartColumn(ws)
  const results: ParsedInvoiceLine[] = []

  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return

    const invoiceDate = excelCellStr(row, 1)
    const invoiceNumber = excelCellStr(row, 2)
    const netChargeAmount = excelCellRawNum(row, 10)
    const serviceType = excelCellStr(row, 11)
    const shipmentDate = excelCellStr(row, 13)
    const recipientState = excelCellStr(row, 37)
    const zoneCode = excelCellStr(row, 63)
    const transportationChargeAmount = excelCellRawNum(row, 9)

    if (!invoiceDate || !invoiceDate.trim()) return
    if (/^invoice\b/i.test(invoiceDate) || /^date\b/i.test(invoiceDate)) return

    if (identifierLooksScientificNotationCorrupted(invoiceNumber)) return

    if (!unpivotOnly && serviceType) {
      results.push({
        charge_description: serviceType,
        charge_amount: transportationChargeAmount || netChargeAmount,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        shipment_date: shipmentDate || undefined,
        zone: zoneCode || undefined,
        destination_state: recipientState || undefined,
        service_level: serviceType || undefined,
      })
    }

    for (let i = 0; i < 25; i++) {
      const descCol = trackingPairDescStart + i * 2
      const amtCol = trackingPairDescStart + 1 + i * 2
      const desc = excelCellStr(row, descCol)
      const amt = excelCellRawNum(row, amtCol)
      if (!desc) continue
      results.push({
        charge_description: desc,
        charge_amount: amt,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        shipment_date: shipmentDate || undefined,
        zone: zoneCode || undefined,
        destination_state: recipientState || undefined,
        service_level: serviceType || undefined,
      })
    }
  })

  return results
}

export async function parseFedEx(
  blob: Uint8Array | ArrayBufferLike,
  options?: FedExParseOptions
): Promise<ParsedInvoiceLine[]> {
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as Uint8Array)
  const workbook = await loadExcelWorkbook(buffer)
  return parseFedExWorksheet(workbook.worksheets[0], options)
}
