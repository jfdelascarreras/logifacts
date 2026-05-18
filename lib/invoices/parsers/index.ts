import type { Carrier } from '@/types/invoice'
import { parseUPS } from './ups'
import { parseFedEx } from './fedex'
import { parseWWE } from './wwe'
import type { ParsedInvoiceLine } from './types'

export type { ParsedInvoiceLine }

/**
 * Detect carrier from filename heuristics.
 * WWE invoices often contain "WWE" or "WorldWide" in the name.
 * FedEx invoices often contain "FedEx" or "FX".
 * Falls back to UPS.
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
