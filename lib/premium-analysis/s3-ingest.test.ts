import { describe, expect, it } from 'vitest'

import { INVOICE_HEADERS } from '@/lib/invoices/csv'
import {
  countInvoiceRowSources,
  invoiceRowRecordsToInvoiceRecords,
  type RawInvoiceRow,
} from '@/lib/premium-analysis/ingest-adapters/invoice-rows'
import { resolvePremiumIngestSource } from '@/lib/premium-analysis/ingest-adapters/index'
import {
  applyIngestQualityGate,
  evaluateIngestQuality,
  shadowCompareIngestTotals,
} from '@/lib/premium-analysis/ingest-quality'

function factRow(partial: Partial<RawInvoiceRow>): RawInvoiceRow {
  return {
    account_number: null,
    invoice_date: null,
    invoice_number: null,
    tracking_number: null,
    charge_category_code: null,
    charge_category_detail_code: null,
    charge_classification_code: null,
    charge_description_code: null,
    charge_description: null,
    net_amount: null,
    invoice_amount: null,
    billed_weight: null,
    entered_weight: null,
    package_quantity: null,
    zone: null,
    carrier_name: null,
    original_service_description: null,
    lead_shipment_number: null,
    shipment_reference_number_1: null,
    mapped: null,
    standardized_charge: null,
    category_1: null,
    category_2: null,
    category_3: null,
    parse_version: null,
    shipment_date: null,
    invoice_upload_id: null,
    source_invoice_id: null,
    ...partial,
  }
}

describe('invoiceRowRecordsToInvoiceRecords', () => {
  it('maps fact row to full InvoiceRecord with tracking and weights', () => {
    const records = invoiceRowRecordsToInvoiceRecords([
      factRow({
        carrier_name: 'FedEx',
        invoice_number: 'INV-1',
        invoice_date: '2025-01-15',
        tracking_number: 'TRK123',
        charge_description: 'Transportation Charge',
        net_amount: 42.5,
        billed_weight: 10,
        entered_weight: 8,
        zone: '05',
        original_service_description: 'FedEx Ground',
        shipment_date: '2025-01-10',
        parse_version: 'fedex-v2',
        source_invoice_id: 'inv-uuid',
      }),
    ])

    expect(records).toHaveLength(1)
    const r = records[0]!
    expect(r['Carrier Name']).toBe('FedEx')
    expect(r['Net Amount']).toBe('42.5')
    expect(r['Tracking Number']).toBe('TRK123')
    expect(r['Billed Weight']).toBe('10')
    expect(r['Entered Weight']).toBe('8')
    expect(r['Shipment Date']).toBe('2025-01-10')
    expect(r['Transaction Date']).toBe('2025-01-10')
    expect(INVOICE_HEADERS.includes('Tracking Number')).toBe(true)
  })

  it('counts distinct upload and source invoice ids', () => {
    const sources = countInvoiceRowSources([
      factRow({ invoice_upload_id: 'u1', source_invoice_id: null }),
      factRow({ invoice_upload_id: 'u1', source_invoice_id: null }),
      factRow({ invoice_upload_id: null, source_invoice_id: 'i1' }),
    ])
    expect(sources).toBe(2)
  })
})

describe('shadowCompareIngestTotals', () => {
  it('passes when totals match within 0.1%', () => {
    const make = (net: string) =>
      Object.fromEntries(INVOICE_HEADERS.map((h) => [h, h === 'Net Amount' ? net : null])) as import('@/lib/invoices/csv').InvoiceRecord

    const result = shadowCompareIngestTotals([make('1000')], [make('1000.5')])
    expect(result.ok).toBe(true)
  })

  it('fails when delta exceeds 0.1%', () => {
    const make = (net: string) =>
      Object.fromEntries(INVOICE_HEADERS.map((h) => [h, h === 'Net Amount' ? net : null])) as import('@/lib/invoices/csv').InvoiceRecord

    const result = shadowCompareIngestTotals([make('1000')], [make('1100')])
    expect(result.ok).toBe(false)
    expect(result.deltaPct).toBeGreaterThan(0.001)
  })
})

describe('evaluateIngestQuality', () => {
  it('blocks savings when unmapped spend exceeds 15% of total', () => {
    const gate = evaluateIngestQuality({ unmappedSpend: 20_000 }, 100_000)
    expect(gate.blockSavings).toBe(true)
    expect(gate.unmappedPctOfSpend).toBeCloseTo(0.2)
    expect(gate.reason).toMatch(/unmapped/i)
  })

  it('allows savings when unmapped share is below threshold', () => {
    const gate = evaluateIngestQuality({ unmappedSpend: 5_000 }, 100_000)
    expect(gate.blockSavings).toBe(false)
  })

  it('strips savings and actions when gate blocks', () => {
    const gated = applyIngestQualityGate(
      {
        savingsEstimate: { low: 1, high: 2, annualizedBasisMonths: 1, opportunities: [] },
        actionItems: [{ rank: 1 }],
      },
      evaluateIngestQuality({ unmappedSpend: 20_000 }, 100_000)
    )
    expect(gated.savingsEstimate).toBeUndefined()
    expect(gated.actionItems).toEqual([])
  })
})

describe('resolvePremiumIngestSource', () => {
  it('defaults to invoice_rows (S6)', () => {
    const prev = process.env.PREMIUM_INGEST_SOURCE
    delete process.env.PREMIUM_INGEST_SOURCE
    expect(resolvePremiumIngestSource()).toBe('invoice_rows')
    if (prev !== undefined) process.env.PREMIUM_INGEST_SOURCE = prev
  })
})
