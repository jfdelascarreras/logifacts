import type { Carrier } from '@/types/invoice'
import { parseUPS } from './ups'
import { parseFedEx } from './fedex'
import { parseWWE } from './wwe'
import type { ParsedInvoiceLine } from './types'

export type { ParsedInvoiceLine }
export { detectCarrierFromBuffer, isExcelBuffer } from './detect-carrier'
export type { CarrierDetectionResult } from './detect-carrier'

/**
 * Filename-only carrier detection — kept for tests and legacy callers.
 * Prefer detectCarrierFromBuffer() for production upload paths.
 */
export function detectCarrier(filename: string): Carrier {
  const name = filename.toLowerCase()
  if (name.includes('wwe') || name.includes('worldwide') || name.includes('world_wide')) return 'WWE'
  if (name.includes('fedex') || name.includes('fdx')) return 'FedEx'
  return 'UPS'
}

export async function parseInvoice(carrier: Carrier, buffer: Buffer): Promise<ParsedInvoiceLine[]> {
  switch (carrier) {
    case 'FedEx':
      return parseFedEx(buffer)
    case 'WWE':
      return parseWWE(buffer)
    case 'UPS':
    default:
      return parseUPS(buffer)
  }
}
