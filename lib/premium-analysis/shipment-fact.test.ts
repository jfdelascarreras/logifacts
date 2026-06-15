import { describe, expect, it } from 'vitest'

import { buildChargeDescriptionLookup, computeInvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'
import { detectAnomalies, sumDollarFlagAmounts } from '@/lib/premium-analysis/anomaly-detection'
import {
  buildShipmentFacts,
  shipmentWeightGapLbs,
  totalShipmentNet,
} from '@/lib/premium-analysis/shipment-fact'
import { buildCarrierMix } from '@/lib/premium-analysis/carrier-mix'
import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'

function row(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  const base = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return { ...base, ...partial }
}

const mappings = [
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
    charge_description: 'Address Correction',
    standardized_charge: 'Address Correction',
    transportation_mode: 'Express',
    category_1: 'Accessorials',
    category_2: 'Address',
    category_3: 'ACCESSORIAL SURCHARGE',
    category_4: '',
    category_5: '',
  },
]

describe('buildShipmentFacts', () => {
  const lookup = buildChargeDescriptionLookup(mappings)

  it('rolls multi-line FedEx shipment to one fact with correct nets', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '80',
        'Billed Weight': '10',
        'Entered Weight': '8',
        'Zone': '03',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '12',
        'Billed Weight': '10',
        'Entered Weight': '8',
        'Zone': '03',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Charge Description': 'Address Correction',
        'Net Amount': '15',
        'Zone': '03',
      }),
    ]

    const facts = buildShipmentFacts(records, lookup, mappings)
    expect(facts).toHaveLength(1)
    const f = facts[0]!
    expect(f.shipmentNet).toBe(107)
    expect(f.baseFreightNet).toBe(80)
    expect(f.fuelNet).toBe(12)
    expect(f.addressCorrectionNet).toBe(15)
    expect(f.billedWeight).toBe(10)
    expect(f.enteredWeight).toBe(8)
    expect(shipmentWeightGapLbs(facts)).toBe(2)
  })

  it('carrier mix uses shipment net once per tracking key', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'Ground',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '40',
        'Zone': '05',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'Ground',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '5',
        'Zone': '05',
      }),
    ]

    const facts = buildShipmentFacts(records, lookup, mappings)
    const mix = buildCarrierMix(facts)
    expect(mix[0]!.totalCost).toBe(45)
    expect(mix[0]!.shipmentCount).toBe(1)
    expect(totalShipmentNet(facts)).toBe(45)
  })

  it('anomaly flag dollars do not exceed total spend', () => {
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Original Service Description': 'FedEx Priority Overnight',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '80',
        'Zone': '03',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK1',
        'Carrier Name': 'FedEx',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '12',
        'Zone': '03',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': 'TRK2',
        'Carrier Name': 'FedEx',
        'Charge Description': 'Address Correction',
        'Net Amount': '20',
        'Zone': '03',
      }),
    ]

    const summary = computeInvoiceAnalysisSummary(records, lookup)
    const flags = detectAnomalies(records, summary, lookup, mappings)
    const flagTotal = sumDollarFlagAmounts(flags)
    expect(flagTotal).toBeLessThanOrEqual(summary.measures.totalCost + 0.01)
  })
})
