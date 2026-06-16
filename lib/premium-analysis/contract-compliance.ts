import type { AnomalyFlag } from '@/lib/premium-analysis/agents-types'
import { toNumber, type InvoiceRecord } from '@/lib/invoices/csv'

export type ContractDiscounts = {
  transportation?: number
  fuelSurcharge?: number
  residential?: number
  [key: string]: number | undefined
}

function trackingFromRecord(rec: InvoiceRecord): string | null {
  return (rec['Tracking Number'] ?? '').trim() || null
}

export function detectContractDiscountShortfalls(
  records: InvoiceRecord[],
  contractDiscounts: ContractDiscounts | null | undefined,
  thresholdPp = 0.02
): AnomalyFlag[] {
  const contractedTransport = contractDiscounts?.transportation
  if (contractedTransport == null || !Number.isFinite(contractedTransport)) return []

  const flags: AnomalyFlag[] = []
  for (const rec of records) {
    const net = toNumber(rec['Net Amount'])
    const incentive = toNumber(rec['Incentive Amount'])
    if (net <= 0 && incentive <= 0) continue

    const gross = net + incentive
    if (gross <= 0) continue

    const effective = incentive / gross
    const shortfall = contractedTransport - effective
    if (shortfall > thresholdPp) {
      flags.push({
        type: 'contract_discount_shortfall',
        trackingNumber: trackingFromRecord(rec),
        invoiceNumber: (rec['Invoice Number'] ?? '').trim() || null,
        amount: net,
        description: `Effective discount ${(effective * 100).toFixed(1)}% is ${(shortfall * 100).toFixed(1)}pp below contracted ${(contractedTransport * 100).toFixed(1)}%`,
        severity: 'high',
      })
    }
  }
  return flags
}
