import { describe, expect, it } from 'vitest'

import { buildChargeDescriptionLookup } from '@/lib/premium-analysis/analysis-summary'
import { resolveAgentsCategory, rollupByAgentsCategory } from '@/lib/premium-analysis/spec-categories'
import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'

function row(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  const base = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return { ...base, ...partial }
}

const mappingRows = [
  {
    carrier: 'UPS',
    charge_description: 'Fuel Surcharge',
    standardized_charge: 'Fuel Surcharge',
    transportation_mode: 'Ground',
    category_1: 'Surcharges',
    category_2: 'UPS Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  },
  {
    carrier: 'UPS',
    charge_description: 'Transportation Charge',
    standardized_charge: 'Transportation Charge',
    transportation_mode: 'Ground',
    category_1: 'Transportation',
    category_2: 'UPS Ground',
    category_3: 'TRANSPORTATION',
    category_4: '',
    category_5: '',
  },
  {
    carrier: 'FedEx',
    charge_description: 'Fuel Surcharge',
    standardized_charge: 'Fuel Surcharge',
    transportation_mode: 'Ground',
    category_1: 'Surcharges',
    category_2: 'FedEx Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  },
]

describe('resolveAgentsCategory', () => {
  const lookup = buildChargeDescriptionLookup(mappingRows)

  it('maps transportation via standardized_charge', () => {
    expect(
      resolveAgentsCategory(
        row({ 'Carrier Name': 'UPS', 'Charge Description': 'Transportation Charge', 'Net Amount': '10' }),
        lookup,
        new Map(),
        mappingRows
      )
    ).toBe('BASE_FREIGHT')
  })

  it('maps fuel via taxonomy', () => {
    expect(
      resolveAgentsCategory(
        row({ 'Carrier Name': 'FedEx', 'Charge Description': 'Fuel Surcharge', 'Net Amount': '2' }),
        lookup,
        new Map(),
        mappingRows
      )
    ).toBe('FUEL')
  })

  it('falls back to substring for unmapped rows', () => {
    expect(
      resolveAgentsCategory(
        row({ 'Carrier Name': 'UPS', 'Charge Description': 'RESIDENTIAL SURCHARGE', 'Net Amount': '5' }),
        lookup,
        new Map(),
        []
      )
    ).toBe('RESIDENTIAL')
  })
})

describe('rollupByAgentsCategory', () => {
  it('rolls up net amounts by category', () => {
    const lookup = buildChargeDescriptionLookup(mappingRows)
    const records = [
      row({ 'Carrier Name': 'UPS', 'Charge Description': 'Transportation Charge', 'Net Amount': '100' }),
      row({ 'Carrier Name': 'UPS', 'Charge Description': 'Fuel Surcharge', 'Net Amount': '20' }),
    ]
    const rollup = rollupByAgentsCategory(records, lookup, mappingRows)
    expect(rollup.totalCost).toBe(120)
    const freight = rollup.categories.find((c) => c.category === 'BASE_FREIGHT')
    const fuel = rollup.categories.find((c) => c.category === 'FUEL')
    expect(freight?.totalCost).toBe(100)
    expect(fuel?.totalCost).toBe(20)
    expect(freight?.pctOfTotal).toBeCloseTo(100 / 120)
  })
})
