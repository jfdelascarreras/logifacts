/**
 * FedEx XLS invoice parser.
 *
 * Two charge sources per row:
 *  1. Service Type (col 11) → base freight row (Transportation Charge Amount, col 9)
 *  2. Up to 25 Tracking ID Charge Description / Amount pairs — anchored from the first header column
 *     titled “Tracking ID Charge Description” (fallback zero-based column 107).
 */
import ExcelJS from 'exceljs'

import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'
import { identifierLooksScientificNotationCorrupted } from '../identifier-safety'
import { loadExcelWorkbook } from './excel-load'
import type { ParsedInvoiceLine } from './types'
import { excelCellRawNum, excelCellStr } from './excel-row'

const TRACKING_CHARGE_DESC_HEADER_RE = /tracking\s*id\s*charge\s*description/i
const EXPRESS_GROUND_TRACKING_ID_RE = /express\s*or\s*ground\s*tracking\s*id$/i

/** Golden-fixture column indices (0-based) — see fedex-header-scan.test.ts */
const FEDEX_COL = {
  consolidatedAccount: 0,
  billToAccount: 1,
  invoiceDate: 2,
  invoiceNumber: 3,
  transportationCharge: 10,
  netCharge: 11,
  serviceType: 12,
  shipmentDate: 14,
  actualWeight: 19,
  ratedWeight: 21,
  numberOfPieces: 23,
  recipientState: 38,
  zoneCode: 64,
  tenderedDate: 105,
} as const

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

function positiveWeight(row: ExcelJS.Row, col: number): number | undefined {
  const n = excelCellRawNum(row, col)
  return n > 0 ? n : undefined
}

function positiveInt(row: ExcelJS.Row, col: number): number | undefined {
  const n = Math.round(excelCellRawNum(row, col))
  return n > 0 ? n : undefined
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

    const invoiceDate = excelCellStr(row, FEDEX_COL.invoiceDate)
    const invoiceNumber = excelCellStr(row, FEDEX_COL.invoiceNumber)
    const transportationChargeAmount = excelCellRawNum(row, FEDEX_COL.transportationCharge)
    const netChargeAmount = excelCellRawNum(row, FEDEX_COL.netCharge)
    const serviceType = excelCellStr(row, FEDEX_COL.serviceType)
    const shipmentDate = excelCellStr(row, FEDEX_COL.shipmentDate)
    const transactionDate = excelCellStr(row, FEDEX_COL.tenderedDate)
    const recipientState = excelCellStr(row, FEDEX_COL.recipientState)
    const zoneCode = excelCellStr(row, FEDEX_COL.zoneCode)
    const billToAccount = excelCellStr(row, FEDEX_COL.billToAccount)
    const consolidatedAccount = excelCellStr(row, FEDEX_COL.consolidatedAccount)
    const accountNumber = billToAccount || consolidatedAccount || undefined
    const enteredWeight = positiveWeight(row, FEDEX_COL.actualWeight)
    const billedWeight = positiveWeight(row, FEDEX_COL.ratedWeight)
    const packageQty = positiveInt(row, FEDEX_COL.numberOfPieces) ?? 1

    if (!invoiceDate || !invoiceDate.trim()) return
    if (/^invoice\b/i.test(invoiceDate) || /^date\b/i.test(invoiceDate)) return

    if (identifierLooksScientificNotationCorrupted(invoiceNumber)) return

    const trackingId = excelCellStr(row, trackingIdCol) || undefined
    if (trackingId && identifierLooksScientificNotationCorrupted(trackingId)) return

    const shared = {
      invoice_number: invoiceNumber || undefined,
      invoice_date: invoiceDate || undefined,
      shipment_date: shipmentDate || undefined,
      transaction_date: transactionDate || undefined,
      zone: zoneCode || undefined,
      destination_state: recipientState || undefined,
      service_level: serviceType || undefined,
      tracking_id: trackingId,
      account_number: accountNumber,
      billed_weight: billedWeight,
      entered_weight: enteredWeight,
      package_quantity: packageQty,
      parse_version: FEDEX_PARSE_VERSION,
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

/** Exposed for regression tests — expected 0-based column indices on standard FedEx detail invoices. */
export const FEDEX_STANDARD_COLUMN_INDICES = FEDEX_COL
