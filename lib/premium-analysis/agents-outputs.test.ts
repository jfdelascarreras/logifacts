import { describe, expect, it } from 'vitest'

import { buildChargeDescriptionLookup, computeInvoiceAnalysisSummary } from '@/lib/premium-analysis/analysis-summary'
import { enrichSummaryWithAgentsOutputs } from '@/lib/premium-analysis/agents-outputs'
import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'

function row(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  const base = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return { ...base, ...partial }
}

const mappings = [
  {
    carrier: 'UPS',
    charge_description: 'Transportation Charge',
    standardized_charge: 'Transportation Charge',
    transportation_mode: 'Ground',
    category_1: 'Transportation',
    category_2: 'Ground',
    category_3: 'TRANSPORTATION',
    category_4: '',
    category_5: '',
  },
  {
    carrier: 'UPS',
    charge_description: 'Address Correction',
    standardized_charge: 'Address Correction',
    transportation_mode: 'Ground',
    category_1: 'Accessorials',
    category_2: 'Address',
    category_3: 'ACCESSORIAL SURCHARGE',
    category_4: '',
    category_5: '',
  },
]

describe('enrichSummaryWithAgentsOutputs', () => {
  it('attaches spec categories, anomalies, savings, and actions', () => {
    const lookup = buildChargeDescriptionLookup(mappings)
    const records = [
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': '1Z1',
        'Carrier Name': 'UPS',
        'Charge Description': 'Transportation Charge',
        'Net Amount': '100',
        'Invoice Date': '01/15/2025',
        'Zone': '5',
        'Package Quantity': '1',
      }),
      row({
        'Invoice Number': 'INV1',
        'Tracking Number': '1Z1',
        'Carrier Name': 'UPS',
        'Charge Description': 'Address Correction',
        'Net Amount': '15',
        'Invoice Date': '01/15/2025',
        'Charge Classification Code': 'ACC',
        'Package Quantity': '1',
      }),
    ]
    const base = computeInvoiceAnalysisSummary(records, lookup)
    const enriched = enrichSummaryWithAgentsOutputs(base, records, mappings, null)

    expect(enriched.specCategories?.totalCost).toBe(115)
    expect(enriched.measures.baseFreightCost).toBe(100)
    expect(enriched.carrierMix?.length).toBeGreaterThan(0)
    expect(enriched.anomalyFlags?.some((f) => f.type === 'address_correction')).toBe(true)
    expect(enriched.savingsEstimate?.high).toBeGreaterThan(0)
    expect(enriched.actionItems?.length).toBeGreaterThan(0)
    expect(enriched.actionItems?.[0]?.executable).toBe(true)
  })
})
