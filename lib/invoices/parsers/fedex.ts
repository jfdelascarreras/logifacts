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
const EXPRESS_GROUND_TRACKING_ID_RE = /express\s*or\s*ground\s*tracking\s*id$/i

function fedExHeaderColumn(ws: ExcelJS.Worksheet, pattern: RegExp, fallback: number, scanFrom = 0): number {
  const headerRow = ws.getRow(1)
  const scanEnd = Math.min(ws.columnCount ?? 220, 240)
  for (let c = scanFrom; c < scanEnd; c++) {
    if (pattern.test(excelCellStr(headerRow, c))) return c
  }
  return fallback
}

/** Header-driven anchor so Tendered Date / MPS Package ID columns before the first pair stay unparsed. */
function fedExTrackingChargeDescStartColumn(ws: ExcelJS.Worksheet): number {
  return fedExHeaderColumn(ws, TRACKING_CHARGE_DESC_HEADER_RE, 107, 70)
}

function fedExTrackingIdColumn(ws: ExcelJS.Worksheet): number {
  return fedExHeaderColumn(ws, EXPRESS_GROUND_TRACKING_ID_RE, 9)
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
  const trackingIdCol = fedExTrackingIdColumn(ws)
  const results: ParsedInvoiceLine[] = []

  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return

    // Column layout (0-based): A=0 "Consolidated Account Number", B=1 "Bill to Account Number",
    // C=2 "Invoice Date", D=3 "Invoice Number", … K=10 "Transportation Charge Amount",
    // L=11 "Net Charge Amount", M=12 "Service Type", O=14 "Shipment Date",
    // AK=38 "Recipient State", BM=64 "Zone Code".
    const invoiceDate = excelCellStr(row, 2)
    const invoiceNumber = excelCellStr(row, 3)
    const transportationChargeAmount = excelCellRawNum(row, 10)
    const netChargeAmount = excelCellRawNum(row, 11)
    const serviceType = excelCellStr(row, 12)
    const shipmentDate = excelCellStr(row, 14)
    const recipientState = excelCellStr(row, 38)
    const zoneCode = excelCellStr(row, 64)

    if (!invoiceDate || !invoiceDate.trim()) return
    if (/^invoice\b/i.test(invoiceDate) || /^date\b/i.test(invoiceDate)) return

    if (identifierLooksScientificNotationCorrupted(invoiceNumber)) return

    const trackingId = excelCellStr(row, trackingIdCol) || undefined
    if (trackingId && identifierLooksScientificNotationCorrupted(trackingId)) return

    const shared = {
      invoice_number: invoiceNumber || undefined,
      invoice_date: invoiceDate || undefined,
      shipment_date: shipmentDate || undefined,
      zone: zoneCode || undefined,
      destination_state: recipientState || undefined,
      service_level: serviceType || undefined,
      tracking_id: trackingId,
      package_quantity: 1,
    }

    if (!unpivotOnly && serviceType) {
      results.push({
        charge_description: serviceType,
        charge_amount: transportationChargeAmount || netChargeAmount,
        charge_classification_code: 'FRT',
        ...shared,
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
        ...shared,
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
