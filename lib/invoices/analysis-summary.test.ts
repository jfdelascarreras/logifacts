/**
 * Accuracy proofs: deterministic assertions on the same engine used by POST /api/invoices/analyze.
 * Extend with real CSV snippets + signed-off expected totals when you validate against Power BI / finance.
 */
import { describe, expect, it } from 'vitest'

import {
  applyProfileSenderCompanyName,
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  mergeInvoiceAnalysisFilterMeta,
  yearMonthKeyFromEngineMonthLabel,
  filterRowsLikeClubColorsPowerQuery,
  INVOICE_HEADERS,
  modeFromZone,
  normalizeInvoiceAnalysisFilters,
  parseInvoiceCsvText,
  parseInvoiceDateKey,
  shipmentPackageDedupeKey,
  weightBucketFromLbs,
  type ChargeDescriptionMappingRow,
  type InvoiceRecord,
} from '@/lib/invoices'

function emptyInvoiceRecord(): InvoiceRecord {
  return Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
}

function invoiceRow(partial: Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>): InvoiceRecord {
  return { ...emptyInvoiceRecord(), ...partial }
}

describe('parseInvoiceDateKey', () => {
  it('parses ISO date component', () => {
    expect(parseInvoiceDateKey('2025-06-30T00:00:00')).toBe('2025-06-30')
    expect(parseInvoiceDateKey('2025-06-30')).toBe('2025-06-30')
  })

  it('parses US-style date component', () => {
    expect(parseInvoiceDateKey('06/30/2025 12:00:00 AM')).toBe('2025-06-30')
    expect(parseInvoiceDateKey('6/30/2025')).toBe('2025-06-30')
  })
})

describe('modeFromZone + weightBucketFromLbs', () => {
  it('maps zone bands like DAX helper', () => {
    expect(modeFromZone(51)).toBe('Ground')
    expect(modeFromZone(481)).toBe('Express/Special')
    expect(weightBucketFromLbs(0.5).bucket).toBe('0-1 lbs')
    expect(weightBucketFromLbs(3).bucket).toBe('2-5 lbs')
  })
})

describe('shipmentPackageDedupeKey', () => {
  it('builds stable key from invoice + tracking', () => {
    const r = invoiceRow({
      'Invoice Number': '2054533994',
      'Tracking Number': '1Z999',
      'Shipment Reference Number 1': '',
      'Lead Shipment Number': '',
    })
    expect(shipmentPackageDedupeKey(r)).toBe('2054533994::1Z999')
  })
})

describe('computeInvoiceAnalysisSummary (synthetic golden)', () => {
  const baseMappingFuel: ChargeDescriptionMappingRow = {
    charge_description: 'Fuel Surcharge',
    transportation_mode: 'Other',
    category_1: 'Fuel Surcharge',
    category_2: 'Fuel Surcharge',
    category_3: 'Fuel Surcharge',
    category_4: '',
    category_5: '',
  }
  const baseMappingFreight: ChargeDescriptionMappingRow = {
    charge_description: 'Ground',
    transportation_mode: 'Parcel',
    category_1: 'Parcel',
    category_2: 'Base Freight',
    category_3: '',
    category_4: '',
    category_5: '',
  }

  it('matches hand-checked totals for freight + fuel + accessorial + package dedupe', () => {
    const lookup = buildChargeDescriptionLookup([baseMappingFuel, baseMappingFreight])

    // Same shipment, two charge lines: Package Quantity should dedupe to max(2,2)=2 once.
    const line1 = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-03-10',
      'Account Number': 'ACC1',
      'Invoice Number': 'INV1',
      'Tracking Number': 'TRK1',
      'Package Quantity': '2',
      'Billed Weight': '3',
      'Entered Weight': '2',
      'Zone': '51',
      'Net Amount': '100.00',
      'Invoice Amount': '100.00',
      'Duty Amount': '0',
      'Original Service Description': 'Ground',
      'Charge Category Code': 'IMP',
      'Charge Classification Code': 'SHP',
      'Charge Description': 'Ground',
    })
    const line2 = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-03-10',
      'Account Number': 'ACC1',
      'Invoice Number': 'INV1',
      'Tracking Number': 'TRK1',
      'Package Quantity': '2',
      'Billed Weight': '3',
      'Entered Weight': '2',
      'Zone': '51',
      'Net Amount': '10.50',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Category Code': 'IMP',
      'Charge Classification Code': 'SHP',
      'Charge Description': 'Fuel Surcharge',
    })
    // Accessorial row (ACC, category not INF/ICC)
    const line3 = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-03-11',
      'Account Number': 'ACC1',
      'Invoice Number': 'INV1',
      'Tracking Number': 'TRK2',
      'Package Quantity': '1',
      'Billed Weight': '1',
      'Entered Weight': '1',
      'Zone': '51',
      'Net Amount': '5.00',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Category Code': 'RES',
      'Charge Classification Code': 'ACC',
      'Charge Description': 'Residential',
    })

    const summary = computeInvoiceAnalysisSummary([line1, line2, line3], lookup)

    expect(summary.totalRows).toBe(3)
    expect(summary.totals.netAmount).toBeCloseTo(115.5, 6)
    expect(summary.measures.totalCost).toBeCloseTo(115.5, 6)
    expect(summary.measures.fuelCost).toBeCloseTo(10.5, 6)
    expect(summary.measures.costAccessorials).toBeCloseTo(5, 6)
    expect(summary.measures.costSurcharges).toBeCloseTo(10.5, 6)
    expect(summary.measures.totalPackages).toBe(3)
    expect(summary.measures.packageDedupeShipmentCount).toBe(2)
    expect(summary.measures.weightGap).toBeCloseTo(2, 6)

    const march = summary.monthlySpend.find((m) => m.month.includes('March') && m.month.includes('2025'))
    expect(march?.totalCost).toBeCloseTo(115.5, 6)
    expect(summary.dailySpend.map((d) => d.date)).toEqual(['2025-03-10', '2025-03-11'])

    expect(summary.dailySpendByAccount).toHaveLength(2)
    const byDate = new Map(summary.dailySpendByAccount.map((r) => [r.date, r]))
    expect(byDate.get('2025-03-10')?.totalCost).toBeCloseTo(110.5, 6)
    expect(byDate.get('2025-03-11')?.totalCost).toBeCloseTo(5, 6)
    expect(byDate.get('2025-03-10')?.accountNumber).toBe('ACC1')

    expect(summary.spendByInvoice).toHaveLength(1)
    expect(summary.spendByInvoice[0]?.accountNumber).toBe('ACC1')
    expect(summary.spendByInvoice[0]?.invoiceNumber).toBe('INV1')
    expect(summary.spendByInvoice[0]?.invoiceDate).toBe('2025-03-10')
    expect(summary.spendByInvoice[0]?.totalCost).toBeCloseTo(115.5, 6)
    expect(summary.spendByInvoice[0]?.costFuel).toBeCloseTo(10.5, 6)
    expect(summary.spendByInvoice[0]?.costAccessorials).toBeCloseTo(5, 6)
    expect(summary.spendByInvoice[0]?.costSurcharges).toBeCloseTo(10.5, 6)
  })

  it('aggregates spendByInvoice by invoice number only when account numbers differ', () => {
    const lookup = buildChargeDescriptionLookup([baseMappingFreight])
    const base = {
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-03-10',
      'Invoice Number': 'INV-DUP',
      'Tracking Number': 'TRKX',
      'Package Quantity': '1',
      'Billed Weight': '1',
      'Entered Weight': '1',
      'Zone': '51',
      'Duty Amount': '0',
      'Invoice Amount': '0',
      'Original Service Description': 'Ground',
      'Charge Category Code': 'IMP',
      'Charge Classification Code': 'SHP',
      'Charge Description': 'Ground',
    } satisfies Partial<Record<(typeof INVOICE_HEADERS)[number], string | null>>
    const rowBadAccount = invoiceRow({
      ...base,
      'Account Number': 'CORRUPT_E74',
      'Net Amount': '40',
    })
    const rowGoodAccount = invoiceRow({
      ...base,
      'Account Number': 'ACC_GOOD',
      'Net Amount': '60',
    })
    const summary = computeInvoiceAnalysisSummary([rowBadAccount, rowGoodAccount], lookup)
    expect(summary.spendByInvoice).toHaveLength(1)
    expect(summary.spendByInvoice[0]?.invoiceNumber).toBe('INV-DUP')
    expect(summary.spendByInvoice[0]?.invoiceDate).toBe('2025-03-10')
    expect(summary.spendByInvoice[0]?.totalCost).toBeCloseTo(100, 6)
    expect(summary.spendByInvoice[0]?.accountNumber).toBe('ACC_GOOD, CORRUPT_E74')
  })
})

describe('yearMonthKeyFromEngineMonthLabel + mergeInvoiceAnalysisFilterMeta', () => {
  it('parses monthlySpend month labels from the engine', () => {
    expect(yearMonthKeyFromEngineMonthLabel('March 2025')).toBe('2025-03')
    expect(yearMonthKeyFromEngineMonthLabel('January 2026')).toBe('2026-01')
  })

  it('fills filter meta from saved summary when filterMeta is missing', () => {
    const merged = mergeInvoiceAnalysisFilterMeta(undefined, {
      dailySpend: [{ date: '2025-06-15' }, { date: '2026-01-02' }],
      monthlySpend: [{ month: 'April 2025' }],
      spendByInvoice: [{ accountNumber: 'ACC99' }, { accountNumber: 'ACC1' }],
      dailySpendByAccount: [{ accountNumber: 'ACC77' }],
    })
    expect(merged.years).toEqual([2026, 2025])
    expect(merged.yearMonths).toContain('2025-06')
    expect(merged.yearMonths).toContain('2026-01')
    expect(merged.yearMonths).toContain('2025-04')
    expect(merged.accountNumbers).toEqual(['ACC1', 'ACC77', 'ACC99'])
  })

  it('splits comma-separated spendByInvoice.accountNumber into distinct filter accounts', () => {
    const merged = mergeInvoiceAnalysisFilterMeta(undefined, {
      spendByInvoice: [{ accountNumber: 'ZZZ, AAA' }],
    })
    expect(merged.accountNumbers).toEqual(['AAA', 'ZZZ'])
  })

  it('unions server filterMeta with summary-derived values', () => {
    const merged = mergeInvoiceAnalysisFilterMeta(
      {
        years: [2025],
        yearMonths: ['2025-01'],
        accountNumbers: ['A'],
      },
      {
        dailySpend: [{ date: '2026-03-10' }],
        spendByInvoice: [{ accountNumber: 'B' }],
      }
    )
    expect(merged.years).toEqual([2026, 2025])
    expect(merged.yearMonths).toContain('2025-01')
    expect(merged.yearMonths).toContain('2026-03')
    expect(merged.accountNumbers).toEqual(['A', 'B'])
  })
})

describe('filterInvoiceRecords + filter meta', () => {
  it('keeps rows in selected year', () => {
    const r2024 = invoiceRow({
      'Invoice Date': '2024-01-15',
      'Account Number': 'A',
      'Invoice Number': '1',
    })
    const r2025 = invoiceRow({
      'Invoice Date': '2025-06-01',
      'Account Number': 'B',
      'Invoice Number': '2',
    })
    const filtered = filterInvoiceRecords([r2024, r2025], { year: 2025 })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toBe(r2025)
  })

  it('keeps rows in selected invoice month (YYYY-MM)', () => {
    const a = invoiceRow({
      'Invoice Date': '2025-03-10',
      'Account Number': 'X',
      'Invoice Number': '1',
    })
    const b = invoiceRow({
      'Invoice Date': '2025-04-01',
      'Account Number': 'X',
      'Invoice Number': '2',
    })
    const out = filterInvoiceRecords([a, b], { yearMonth: '2025-03' })
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(a)
  })

  it('buildInvoiceAnalysisFilterMeta collects years and accounts', () => {
    const meta = buildInvoiceAnalysisFilterMeta([
      invoiceRow({ 'Invoice Date': '2025-03-10', 'Account Number': 'Z9' }),
      invoiceRow({ 'Invoice Date': '2025-04-01', 'Account Number': 'A1' }),
    ])
    expect(meta.years).toEqual([2025])
    expect(meta.yearMonths).toEqual(['2025-04', '2025-03'])
    expect(meta.accountNumbers).toEqual(['A1', 'Z9'])
  })

  it('normalizeInvoiceAnalysisFilters parses POST-shaped payloads', () => {
    expect(normalizeInvoiceAnalysisFilters({ yearMonth: '2026-03', accountNumber: '  X1 ' })).toEqual({
      yearMonth: '2026-03',
      accountNumber: 'X1',
    })
    expect(normalizeInvoiceAnalysisFilters({ year: '2026', month: 3, accountNumber: '  X1 ' })).toEqual({
      year: 2026,
      months: [3],
      accountNumber: 'X1',
    })
    expect(normalizeInvoiceAnalysisFilters({ months: [1, 6, 1], year: 2025 })).toEqual({
      year: 2025,
      months: [1, 6],
    })
  })

  it('filterInvoiceRecords applies multiple calendar months', () => {
    const rows = [
      invoiceRow({ 'Invoice Date': '2025-01-10', 'Invoice Number': '1' }),
      invoiceRow({ 'Invoice Date': '2025-03-05', 'Invoice Number': '2' }),
      invoiceRow({ 'Invoice Date': '2025-06-01', 'Invoice Number': '3' }),
    ]
    const out = filterInvoiceRecords(rows, { year: 2025, months: [1, 6] })
    expect(out.map((r) => r['Invoice Number'])).toEqual(['1', '3'])
  })
})

describe('parse → filter → profile sender (pipeline smoke)', () => {
  it('produces records that survive Club Colors-style filter', () => {
    const idx = Object.fromEntries(INVOICE_HEADERS.map((h, i) => [h, i])) as Record<string, number>
    const cells = Array(INVOICE_HEADERS.length).fill('')
    cells[idx['Invoice Date']] = '2025-01-15'
    cells[idx['Invoice Number']] = '9001'
    cells[idx['Recipient Number']] = 'R123'
    cells[idx['Carrier Name']] = 'UPS'
    cells[idx['Net Amount']] = '42.00'
    cells[idx['Zone']] = '02'
    cells[idx['Package Quantity']] = '1'
    cells[idx['Billed Weight']] = '1'
    cells[idx['Entered Weight']] = '1'
    cells[idx['Charge Category Code']] = 'IMP'
    cells[idx['Charge Classification Code']] = 'SHP'
    cells[idx['Charge Description']] = 'Ground'
    cells[idx['Tracking Number']] = 'Z1'

    const csvText = cells.join(',')
    const parsed = parseInvoiceCsvText(csvText)
    const filtered = filterRowsLikeClubColorsPowerQuery(parsed)
    const withSender = applyProfileSenderCompanyName(filtered, 'Acme Logistics')

    expect(withSender).toHaveLength(1)
    expect(withSender[0]?.['Sender Company Name']).toBe('Acme Logistics')
    expect(withSender[0]?.['Net Amount']).toBe('42.00')
  })
})
