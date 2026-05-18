/**
 * FedEx XLS invoice parser.
 *
 * Two charge sources per row:
 *  1. Service Type (col 11) → base freight row (Transportation Charge Amount, col 9)
 *  2. Up to 25 Tracking ID Charge Description / Amount pairs (cols 105+, every other col)
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

export async function parseFedEx(buffer: Buffer): Promise<ParsedInvoiceLine[]> {
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

    const invoiceDate = cellStr(row, 1)
    const invoiceNumber = cellStr(row, 2)
    const netChargeAmount = cellNum(row, 10)
    const serviceType = cellStr(row, 11)
    const shipmentDate = cellStr(row, 13)
    const recipientState = cellStr(row, 37)
    const zoneCode = cellStr(row, 63)
    const transportationChargeAmount = cellNum(row, 9)

    if (!invoiceDate || !serviceType) return

    // Base freight row from Service Type
    if (serviceType) {
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

    // Unpivot accessorial charge pairs (cols 105–154, 0-indexed: desc at 105,107,109... amount at 106,108,110...)
    for (let i = 0; i < 25; i++) {
      const descCol = 105 + i * 2
      const amtCol = 106 + i * 2
      const desc = cellStr(row, descCol)
      const amt = cellNum(row, amtCol)
      if (!desc) break
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
