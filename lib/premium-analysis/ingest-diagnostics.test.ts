import { describe, expect, it } from 'vitest'

import { INVOICE_HEADERS, type InvoiceRecord } from '@/lib/invoices/csv'
import { buildChargeDescriptionLookup } from '@/lib/premium-analysis/analysis-summary'
import { buildIngestDiagnostics } from '@/lib/premium-analysis/ingest-diagnostics'

function row(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  const base = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return { ...base, ...partial }
}

const mappings = [
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
]

describe('buildIngestDiagnostics', () => {
  it('counts mapped lines, unmapped spend, and tracking coverage', () => {
    const lookup = buildChargeDescriptionLookup(mappings)
    const records = [
      row({
        'Carrier Name': 'FedEx',
        'Charge Description': 'Fuel Surcharge',
        'Net Amount': '10',
        'Tracking Number': 'TRK1',
        'Invoice Number': 'INV1',
        'Shipment Date': '01/15/2025',
      }),
      row({
        'Carrier Name': 'FedEx',
        'Charge Description': 'Unknown Fee',
        'Net Amount': '5',
        'Tracking Number': 'TRK2',
        'Invoice Number': 'INV1',
        'Shipment Date': '01/15/2025',
      }),
      row({
        'Carrier Name': 'FedEx',
        'Charge Description': 'Mystery',
        'Net Amount': '3',
        'Invoice Number': 'INV1',
      }),
    ]

    const diag = buildIngestDiagnostics(
      records,
      {
        duplicateUploadRowsSkipped: 1,
        duplicateChargeRowsDropped: 0,
        rowsDroppedCriticalSciCorruption: 0,
      },
      lookup,
      ['fedex-v2']
    )

    expect(diag.linesTotal).toBe(3)
    expect(diag.linesMapped).toBe(1)
    expect(diag.unmappedSpend).toBe(8)
    expect(diag.shipmentsTotal).toBe(2)
    expect(diag.shipmentsWithoutTracking).toBe(0)
    expect(diag.parseVersions).toEqual(['fedex-v2'])
  })
})
