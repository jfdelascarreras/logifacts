import { identifierLooksScientificNotationCorrupted } from '../identifier-safety'
import { INVOICE_HEADERS } from '../headers'
import { splitCsvLine } from '../csv'
import { cleanText, toNum } from './scalars'
import type { ParsedInvoiceLine } from './types'

function col(name: (typeof INVOICE_HEADERS)[number]): number {
  return INVOICE_HEADERS.indexOf(name)
}

/**
 * Parses a UPS 250-column CSV buffer into individual charge lines.
 * Wraps the existing header layout — does NOT re-implement CSV parsing logic.
 */
export function parseUPS(buffer: Buffer): ParsedInvoiceLine[] {
  // Strip null bytes before parsing — UPS exports occasionally embed \u0000
  const text = buffer.toString('utf-8').replace(/\u0000/g, '')
  const lines = text.split(/\r?\n/)
  const results: ParsedInvoiceLine[] = []

  const chargeDescCol          = col('Charge Description')
  const netAmountCol           = col('Net Amount')
  const invoiceDateCol         = col('Invoice Date')
  const invoiceNumberCol       = col('Invoice Number')
  const transactionDateCol     = col('Transaction Date')
  const zoneCol                = col('Zone')
  const ref1Col                = col('Shipment Reference Number 1')
  const receiverStateCol       = col('Receiver State')
  const origServiceCol         = col('Original Service Description')
  const classCodeCol           = col('Charge Classification Code')
  const catCodeCol             = col('Charge Category Code')
  const packageQtyCol          = col('Package Quantity')
  const accountNumberCol       = col('Account Number')

  for (const line of lines) {
    if (!line.trim()) continue
    const cols = splitCsvLine(line)
    if (cols.length < 50) continue

    const invoiceDate = cleanText(cols[invoiceDateCol])
    if (!invoiceDate || invoiceDate === 'Invoice Date') continue

    const chargeDesc = cleanText(cols[chargeDescCol])
    if (!chargeDesc) continue

    const netAmount    = toNum(cols[netAmountCol])
    const shipmentDate = cleanText(cols[transactionDateCol]) || undefined
    const zone         = cleanText(cols[zoneCol]) || undefined
    const destState    = cleanText(cols[receiverStateCol]) || undefined
    const serviceLevel = cleanText(cols[origServiceCol]) || undefined
    const ref1         = cleanText(cols[ref1Col]) || undefined
    const invoiceNumber = cleanText(cols[invoiceNumberCol]) || undefined
    const accountNumber = cleanText(cols[accountNumberCol]) || undefined
    if (
      identifierLooksScientificNotationCorrupted(invoiceNumber ?? '') ||
      identifierLooksScientificNotationCorrupted(accountNumber ?? '')
    ) {
      continue
    }
    const chargeClassificationCode = cleanText(cols[classCodeCol]).toUpperCase() || undefined
    const chargeCategoryCode       = cleanText(cols[catCodeCol]).toUpperCase() || undefined
    const packageQuantity          = toNum(cols[packageQtyCol]) || undefined

    results.push({
      charge_description: chargeDesc,
      charge_amount: netAmount,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate || undefined,
      shipment_date: shipmentDate,
      zone,
      destination_state: destState,
      service_level: serviceLevel,
      reference_1: ref1,
      charge_classification_code: chargeClassificationCode,
      charge_category_code: chargeCategoryCode,
      package_quantity: packageQuantity,
    })
  }

  return results
}
