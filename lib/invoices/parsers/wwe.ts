/**
 * World Wide Express (WWE) XLS invoice parser.
 *
 * Up to 8 Charge Type / Charge Amount pairs per row — must unpivot before joining.
 * Physical carrier is UPS (SCAC col 7 = 'UPS') but carrier is stored as 'WWE'.
 *
 * Requires: pnpm add exceljs
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJSMod = (() => { try { return require('exceljs') } catch { return null } })()
import { excelCellAsDisplayString } from '../excel-cell-display'
import type { ParsedInvoiceLine } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellStr(row: any, col: number): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return excelCellAsDisplayString(row.getCell(col + 1))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellNum(row: any, col: number): number {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const v = row.getCell(col + 1).value
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isNaN(n) ? 0 : n
}

// Col indices (0-indexed) per spec
const CHARGE_TYPE_COLS = [39, 41, 43, 45, 47, 49, 51, 53]
const CHARGE_AMT_COLS = [40, 42, 44, 46, 48, 50, 52, 54]

export async function parseWWE(buffer: Buffer): Promise<ParsedInvoiceLine[]> {
  if (!ExcelJSMod) throw new Error('ExcelJS not installed. Run: pnpm add exceljs')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const workbook = new ExcelJSMod.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  await workbook.xlsx.load(buffer)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const ws = workbook.worksheets[0]
  if (!ws) return []

  const results: ParsedInvoiceLine[] = []

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  ws.eachRow((row: unknown, rowNumber: number) => {
    if (rowNumber === 1) return

    const invoiceNumber = cellStr(row, 1)
    const shipDate = cellStr(row, 4)
    const invoiceDate = cellStr(row, 56)
    const receiverState = cellStr(row, 21)
    const serviceLevel = cellStr(row, 62)
    const zone = cellStr(row, 63)

    if (!invoiceDate && !shipDate) return

    for (let i = 0; i < CHARGE_TYPE_COLS.length; i++) {
      const chargeType = cellStr(row, CHARGE_TYPE_COLS[i])
      const chargeAmt = cellNum(row, CHARGE_AMT_COLS[i])
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
      })
    }
  })

  return results
}
