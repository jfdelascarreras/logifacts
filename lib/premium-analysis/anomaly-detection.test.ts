import { describe, expect, it } from 'vitest'

import { buildChargeDescriptionLookup, computeInvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'
import { detectAnomalies } from '@/lib/premium-analysis/anomaly-detection'
import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'

function row(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  const base = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return { ...base, ...partial }
}

const fedExMappings = [
  {
    carrier: 'FedEx',
    charge_description: 'Transportation Charge',
    standardized_charge: 'Transportation Charge',
    transportation_mode: 'Express',
    category_1: 'Transportation',
    category_2: 'Express',
    category_3: 'TRANSPORTATION',
    category_4: '',
    category_5: '',
  },
  {
    carrier: 'FedEx',
    charge_description: 'Fuel Surcharge',
    standardized_charge: 'Fuel Surcharge',
    transportation_mode: 'Express',
    category_1: 'Fuel',
    category_2: 'Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  },
  {
    carrier: 'FedEx',
    charge_description: 'Earned Discount',
    standardized_charge: 'Earned Discount',
    transportation_mode: 'Express',
    category_1: 'Discount',
    category_2: 'Discount',
    category_3: 'DISCOUNT',
    category_4: '',
    category_5: '',
  },
]

describe('detectAnomalies — avoidable expedited', () => {
  const lookup = buildChargeDescriptionLookup(fedExMappings)

  it('flags once per shipment using base freight net, not every surcharge line', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '80',
        'Zone': '03',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '12',
        'Zone': '03',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Earned Discount',
        'Net Amount': '-20',
        'Zone': '03',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
    ]

    const summary = computeInvoiceAnalysisSummary(records, lookup)
    const flags = detectAnomalies(records, summary, lookup, fedExMappings)
    const expedited = flags.filter((f) => f.type === 'avoidable_expedited')

    expect(expedited).toHaveLength(1)
    // Marginal premium vs Ground — less than base freight ($80), capped at shipment net ($72)
    expect(expedited[0]!.amount).toBeGreaterThan(0)
    expect(expedited[0]!.amount).toBeLessThan(80)
    expect(expedited[0]!.amount).toBeLessThanOrEqual(72)
    expect(expedited[0]!.trackingNumber).toBe('TRK1')
  })

  it('caps avoidable amount at shipment net when discounts exceed base freight lines', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK2',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Express Saver',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '50',
        'Zone': '2',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK2',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Express Saver',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '8',
        'Zone': '2',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK2',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Express Saver',
        'Charge Description': 'Earned Discount',
        'Net Amount': '-30',
        'Zone': '2',
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
    ]

    const summary = computeInvoiceAnalysisSummary(records, lookup)
    const flags = detectAnomalies(records, summary, lookup, fedExMappings)
    const expedited = flags.filter((f) => f.type === 'avoidable_expedited')

    expect(expedited).toHaveLength(1)
    // Marginal premium capped at shipment net ($28)
    expect(expedited[0]!.amount).toBeGreaterThan(0)
    expect(expedited[0]!.amount).toBeLessThanOrEqual(28)
  })

  it('does not flag expedited shipments with missing zone (zone 0)', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK3',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '100',
        'Zone': null,
        'Invoice Date': '01/15/2025',
        'Package Quantity': '1',
      }),
    ]

    const summary = computeInvoiceAnalysisSummary(records, lookup)
    const flags = detectAnomalies(records, summary, lookup, fedExMappings)

    expect(flags.some((f) => f.type === 'avoidable_expedited')).toBe(false)
  })
})
