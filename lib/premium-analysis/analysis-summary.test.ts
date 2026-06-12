/**
 * Accuracy proofs: deterministic assertions on the same engine used by POST /api/invoices/analyze.
 * Extend with real CSV snippets + signed-off expected totals when you validate against Power BI / finance.
 */
import { describe, expect, it } from 'vitest'

import {
  applyProfileSenderCompanyName,
  filterRowsLikeClubColorsPowerQuery,
  INVOICE_HEADERS,
  parseInvoiceCsvText,
  type InvoiceRecord,
} from '@/lib/invoices/csv'
import {
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  mergeInvoiceAnalysisFilterMeta,
  yearMonthKeyFromEngineMonthLabel,
  modeFromZone,
  normalizeInvoiceAnalysisFilters,
  parseInvoiceDateKey,
  shipmentPackageDedupeKey,
  weightBucketFromLbs,
  type ChargeDescriptionMappingRow,
} from '@/lib/premium-analysis'

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

  it('FedEx: prefers Shipment Date over Invoice Date when both are set', () => {
    const lookup = buildChargeDescriptionLookup([baseMappingFreight])
    const row = invoiceRow({
      'Carrier Name': 'FedEx',
      'Invoice Date': '2024-11-27',
      'Shipment Date': '2024-10-15',
      'Account Number': 'FX1',
      'Invoice Number': 'INVFX',
      'Tracking Number': 'TRKFX',
      'Package Quantity': '1',
      'Net Amount': '25',
      'Invoice Amount': '25',
      'Charge Description': 'Ground',
    })
    const summary = computeInvoiceAnalysisSummary([row], lookup)
    expect(summary.dailySpend.map((d) => d.date)).toContain('2024-10-15')
    expect(summary.dailySpend.map((d) => d.date)).not.toContain('2024-11-27')
    const oct = summary.monthlySpend.find((m) => m.month.includes('October') && m.month.includes('2024'))
    expect(oct?.totalCost).toBeCloseTo(25, 6)
  })

  it('FedEx: rolls up daily/monthly spend using Transaction Date when Invoice Date is empty', () => {
    const lookup = buildChargeDescriptionLookup([baseMappingFreight])
    const row = invoiceRow({
      'Carrier Name': 'FedEx',
      'Invoice Date': '',
      'Transaction Date': '2025-06-01',
      'Shipment Date': '',
      'Account Number': 'FX1',
      'Invoice Number': 'INVFX',
      'Tracking Number': 'TRKFX',
      'Package Quantity': '1',
      'Billed Weight': '1',
      'Entered Weight': '1',
      'Zone': '51',
      'Net Amount': '50',
      'Invoice Amount': '50',
      'Duty Amount': '0',
      'Original Service Description': 'Ground',
      'Charge Category Code': 'IMP',
      'Charge Classification Code': 'SHP',
      'Charge Description': 'Ground',
    })
    const summary = computeInvoiceAnalysisSummary([row], lookup)
    expect(summary.dailySpend.map((d) => d.date)).toContain('2025-06-01')
    const june = summary.monthlySpend.find((m) => m.month.includes('June') && m.month.includes('2025'))
    expect(june?.totalCost).toBeCloseTo(50, 6)
    expect(summary.dailySpendByAccount.some((r) => r.date === '2025-06-01')).toBe(true)
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

  it('FedEx: filter meta uses Transaction Date when Invoice Date is empty', () => {
    const meta = buildInvoiceAnalysisFilterMeta([
      invoiceRow({
        'Carrier Name': 'FedEx',
        'Invoice Date': '',
        'Transaction Date': '2025-09-15',
        'Account Number': 'Z9',
      }),
    ])
    expect(meta.years).toEqual([2025])
    expect(meta.yearMonths).toContain('2025-09')
  })

  it('FedEx: year filter matches Transaction Date when Invoice Date is empty', () => {
    const rec = invoiceRow({
      'Carrier Name': 'FedEx',
      'Invoice Date': '',
      'Transaction Date': '2025-08-01',
      'Invoice Number': '1',
      'Account Number': 'A',
    })
    expect(filterInvoiceRecords([rec], { year: 2025 })).toHaveLength(1)
    expect(filterInvoiceRecords([rec], { year: 2024 })).toHaveLength(0)
  })

  it('UPS: year filter does not use Transaction Date when Invoice Date is empty', () => {
    const rec = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '',
      'Transaction Date': '2025-08-01',
      'Invoice Number': '1',
      'Account Number': 'A',
    })
    expect(filterInvoiceRecords([rec], { year: 2025 })).toHaveLength(0)
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

  it('FedEx: keeps rows when Invoice Date is blank but Transaction Date is set', () => {
    const idx = Object.fromEntries(INVOICE_HEADERS.map((h, i) => [h, i])) as Record<string, number>
    const cells = Array(INVOICE_HEADERS.length).fill('')
    cells[idx['Invoice Date']] = ''
    cells[idx['Transaction Date']] = '2025-03-01'
    cells[idx['Invoice Number']] = 'FX-1'
    cells[idx['Carrier Name']] = 'FedEx'
    cells[idx['Net Amount']] = '10.00'
    cells[idx['Charge Description']] = 'Ground'
    cells[idx['Tracking Number']] = 'T1'

    const csvText = cells.join(',')
    const parsed = parseInvoiceCsvText(csvText)
    const filtered = filterRowsLikeClubColorsPowerQuery(parsed)
    expect(filtered).toHaveLength(1)
  })

  it('FedEx: drops rows when Invoice / Transaction / Shipment dates are all empty', () => {
    const idx = Object.fromEntries(INVOICE_HEADERS.map((h, i) => [h, i])) as Record<string, number>
    const cells = Array(INVOICE_HEADERS.length).fill('')
    cells[idx['Carrier Name']] = 'FedEx'
    cells[idx['Net Amount']] = '10.00'

    const csvText = cells.join(',')
    const parsed = parseInvoiceCsvText(csvText)
    expect(filterRowsLikeClubColorsPowerQuery(parsed)).toHaveLength(0)
  })

  it('WWE: keeps rows when Shipment Date is set but Invoice Date is blank', () => {
    const idx = Object.fromEntries(INVOICE_HEADERS.map((h, i) => [h, i])) as Record<string, number>
    const cells = Array(INVOICE_HEADERS.length).fill('')
    cells[idx['Invoice Date']] = ''
    cells[idx['Shipment Date']] = '2025-04-10'
    cells[idx['Carrier Name']] = 'WWE'
    cells[idx['Net Amount']] = '5.00'
    cells[idx['Charge Description']] = 'SMALL PACKAGE FREIGHT'

    const csvText = cells.join(',')
    const parsed = parseInvoiceCsvText(csvText)
    expect(filterRowsLikeClubColorsPowerQuery(parsed)).toHaveLength(1)
  })
})

describe('modeFromZone — all boundary edges', () => {
  it('Ground: 0–99', () => {
    expect(modeFromZone(0)).toBe('Ground')
    expect(modeFromZone(51)).toBe('Ground')
    expect(modeFromZone(99)).toBe('Ground')
  })
  it('International Import: 100–199', () => {
    expect(modeFromZone(100)).toBe('International Import')
    expect(modeFromZone(150)).toBe('International Import')
    expect(modeFromZone(199)).toBe('International Import')
  })
  it('International Export: 200–299', () => {
    expect(modeFromZone(200)).toBe('International Export')
    expect(modeFromZone(250)).toBe('International Export')
    expect(modeFromZone(299)).toBe('International Export')
  })
  it('Air: 300–399', () => {
    expect(modeFromZone(300)).toBe('Air')
    expect(modeFromZone(350)).toBe('Air')
    expect(modeFromZone(399)).toBe('Air')
  })
  it('Express/Special: 400–499', () => {
    expect(modeFromZone(400)).toBe('Express/Special')
    expect(modeFromZone(481)).toBe('Express/Special')
    expect(modeFromZone(499)).toBe('Express/Special')
  })
  it('Unknown: below 0 and 500+', () => {
    expect(modeFromZone(-1)).toBe('Unknown')
    expect(modeFromZone(500)).toBe('Unknown')
    expect(modeFromZone(9999)).toBe('Unknown')
  })
})

describe('weightBucketFromLbs — all boundary edges', () => {
  it('0-1 lbs: 0 through 1.0', () => {
    expect(weightBucketFromLbs(0).bucket).toBe('0-1 lbs')
    expect(weightBucketFromLbs(0.5).bucket).toBe('0-1 lbs')
    expect(weightBucketFromLbs(1.0).bucket).toBe('0-1 lbs')
  })
  it('2-5 lbs: just above 1 through 5', () => {
    expect(weightBucketFromLbs(1.01).bucket).toBe('2-5 lbs')
    expect(weightBucketFromLbs(3).bucket).toBe('2-5 lbs')
    expect(weightBucketFromLbs(5).bucket).toBe('2-5 lbs')
  })
  it('6-10 lbs: just above 5 through 10', () => {
    expect(weightBucketFromLbs(5.01).bucket).toBe('6-10 lbs')
    expect(weightBucketFromLbs(7).bucket).toBe('6-10 lbs')
    expect(weightBucketFromLbs(10).bucket).toBe('6-10 lbs')
  })
  it('11-20 lbs: just above 10 through 20', () => {
    expect(weightBucketFromLbs(10.01).bucket).toBe('11-20 lbs')
    expect(weightBucketFromLbs(15).bucket).toBe('11-20 lbs')
    expect(weightBucketFromLbs(20).bucket).toBe('11-20 lbs')
  })
  it('21-50 lbs: just above 20 through 50', () => {
    expect(weightBucketFromLbs(20.01).bucket).toBe('21-50 lbs')
    expect(weightBucketFromLbs(35).bucket).toBe('21-50 lbs')
    expect(weightBucketFromLbs(50).bucket).toBe('21-50 lbs')
  })
  it('51-100 lbs: just above 50 through 100', () => {
    expect(weightBucketFromLbs(50.01).bucket).toBe('51-100 lbs')
    expect(weightBucketFromLbs(75).bucket).toBe('51-100 lbs')
    expect(weightBucketFromLbs(100).bucket).toBe('51-100 lbs')
  })
  it('100+ lbs: above 100', () => {
    expect(weightBucketFromLbs(100.01).bucket).toBe('100+ lbs')
    expect(weightBucketFromLbs(999).bucket).toBe('100+ lbs')
  })
})

describe('buildChargeDescriptionLookup — carrier priority and legacy fallback', () => {
  const ups: ChargeDescriptionMappingRow = {
    carrier: 'UPS',
    charge_description: 'Fuel Surcharge',
    transportation_mode: 'Parcel',
    category_1: 'Fuel',
    category_2: 'UPS Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  }
  const fedex: ChargeDescriptionMappingRow = {
    carrier: 'FedEx',
    charge_description: 'Fuel Surcharge',
    transportation_mode: 'Parcel',
    category_1: 'Fuel',
    category_2: 'FedEx Fuel',
    category_3: 'FUEL SURCHARGE',
    category_4: '',
    category_5: '',
  }

  it('UPS composite key and legacy key both resolve', () => {
    const lookup = buildChargeDescriptionLookup([ups])
    expect(lookup.get('UPS\tFUEL SURCHARGE')?.category_2).toBe('UPS Fuel')
    expect(lookup.get('FUEL SURCHARGE')?.category_2).toBe('UPS Fuel')
  })

  it('FedEx composite key resolves but no legacy key is set', () => {
    const lookup = buildChargeDescriptionLookup([fedex])
    expect(lookup.get('FEDEX\tFUEL SURCHARGE')?.category_2).toBe('FedEx Fuel')
    expect(lookup.get('FUEL SURCHARGE')).toBeUndefined()
  })

  it('UPS key does not overwrite FedEx key when both present', () => {
    const lookup = buildChargeDescriptionLookup([ups, fedex])
    expect(lookup.get('UPS\tFUEL SURCHARGE')?.category_2).toBe('UPS Fuel')
    expect(lookup.get('FEDEX\tFUEL SURCHARGE')?.category_2).toBe('FedEx Fuel')
  })

  it('normalizes charge_description casing and whitespace before keying', () => {
    const row: ChargeDescriptionMappingRow = {
      carrier: 'UPS',
      charge_description: '  fuel  surcharge  ',
      transportation_mode: '',
      category_1: '',
      category_2: 'normalized',
      category_3: '',
      category_4: '',
      category_5: '',
    }
    const lookup = buildChargeDescriptionLookup([row])
    expect(lookup.get('FUEL SURCHARGE')?.category_2).toBe('normalized')
  })
})

describe('computeInvoiceAnalysisSummary — byCarrier/byService chargeLineCount', () => {
  it('increments chargeLineCount per charge line, not per shipment', () => {
    const lookup = buildChargeDescriptionLookup([])
    const line1 = invoiceRow({ 'Carrier Name': 'UPS', 'Net Amount': '10', 'Invoice Amount': '10', 'Original Service Description': 'Ground' })
    const line2 = invoiceRow({ 'Carrier Name': 'UPS', 'Net Amount': '5', 'Invoice Amount': '5', 'Original Service Description': 'Ground' })
    const line3 = invoiceRow({ 'Carrier Name': 'FedEx', 'Net Amount': '20', 'Invoice Amount': '20', 'Original Service Description': 'Express' })

    const summary = computeInvoiceAnalysisSummary([line1, line2, line3], lookup)

    expect(summary.byCarrier['UPS']?.chargeLineCount).toBe(2)
    expect(summary.byCarrier['FedEx']?.chargeLineCount).toBe(1)
    expect(summary.byService['Ground']?.chargeLineCount).toBe(2)
    expect(summary.byService['Express']?.chargeLineCount).toBe(1)
  })
})

describe('computeInvoiceAnalysisSummary — INF/ICC exclusion from costAccessorials', () => {
  it('excludes ACC rows with category code INF from costAccessorials', () => {
    const lookup = buildChargeDescriptionLookup([])
    const inf = invoiceRow({
      'Carrier Name': 'UPS',
      'Net Amount': '3.00',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': 'ACC',
      'Charge Category Code': 'INF',
    })
    const summary = computeInvoiceAnalysisSummary([inf], lookup)
    expect(summary.measures.costAccessorials).toBe(0)
    expect(summary.measures.totalCost).toBeCloseTo(3, 6)
  })

  it('excludes ACC rows with category code ICC from costAccessorials', () => {
    const lookup = buildChargeDescriptionLookup([])
    const icc = invoiceRow({
      'Carrier Name': 'UPS',
      'Net Amount': '-2.50',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': 'ACC',
      'Charge Category Code': 'ICC',
    })
    const summary = computeInvoiceAnalysisSummary([icc], lookup)
    expect(summary.measures.costAccessorials).toBe(0)
  })

  it('includes ACC rows with other category codes in costAccessorials', () => {
    const lookup = buildChargeDescriptionLookup([])
    const res = invoiceRow({
      'Net Amount': '7.00',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': 'ACC',
      'Charge Category Code': 'RES',
    })
    const summary = computeInvoiceAnalysisSummary([res], lookup)
    expect(summary.measures.costAccessorials).toBeCloseTo(7, 6)
  })

  it('includes WWE/FedEx accessorial taxonomy rows without ACC classification', () => {
    const lookup = buildChargeDescriptionLookup([
      {
        carrier: 'WWE',
        charge_description: 'ADDITIONAL HANDLING WEIGHT',
        transportation_mode: 'Other',
        category_1: 'Accessorial Surcharge',
        category_2: 'Handling',
        category_3: 'Accessorials',
        category_4: 'Handling & Size',
        category_5: 'Weight',
      },
    ])
    const wwe = invoiceRow({
      'Carrier Name': 'WWE',
      'Charge Description': 'ADDITIONAL HANDLING WEIGHT',
      'Net Amount': '12.50',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': '',
      'Charge Category Code': '',
    })
    const summary = computeInvoiceAnalysisSummary([wwe], lookup)
    expect(summary.measures.costAccessorials).toBeCloseTo(12.5, 6)
    expect(summary.measures.costSurcharges).toBe(0)
  })

  it('does not double-count peak surcharges as accessorials via taxonomy', () => {
    const lookup = buildChargeDescriptionLookup([
      {
        carrier: 'WWE',
        charge_description: 'PEAK SURCHARGE COMMERCIAL',
        transportation_mode: 'Other',
        category_1: 'Accessorial Surcharge',
        category_2: 'Peak/Demand',
        category_3: 'Surcharge',
        category_4: 'Peak Season',
        category_5: 'Commercial',
      },
    ])
    const wwe = invoiceRow({
      'Carrier Name': 'WWE',
      'Charge Description': 'PEAK SURCHARGE COMMERCIAL',
      'Net Amount': '4.00',
      'Invoice Amount': '0',
      'Duty Amount': '0',
    })
    const summary = computeInvoiceAnalysisSummary([wwe], lookup)
    expect(summary.measures.costSurcharges).toBeCloseTo(4, 6)
    expect(summary.measures.costAccessorials).toBe(0)
  })
})

describe('computeInvoiceAnalysisSummary — CPP rollups', () => {
  it('category2VolumeCpp totals cost and volume, computes CPP', () => {
    const mapping: ChargeDescriptionMappingRow = {
      carrier: 'UPS',
      charge_description: 'Ground',
      transportation_mode: 'Parcel',
      category_1: 'Parcel',
      category_2: 'Base Freight',
      category_3: '',
      category_4: '',
      category_5: '',
    }
    const lookup = buildChargeDescriptionLookup([mapping])
    const row1 = invoiceRow({
      'Carrier Name': 'UPS',
      'Net Amount': '100',
      'Invoice Amount': '100',
      'Duty Amount': '0',
      'Package Quantity': '2',
      'Zone': '51',
      'Charge Description': 'Ground',
    })
    const row2 = invoiceRow({
      'Carrier Name': 'UPS',
      'Net Amount': '50',
      'Invoice Amount': '50',
      'Duty Amount': '0',
      'Package Quantity': '1',
      'Zone': '51',
      'Charge Description': 'Ground',
    })

    const summary = computeInvoiceAnalysisSummary([row1, row2], lookup)
    // category2 is normalized to uppercase by normalizeMappingText
    const bf = summary.category2VolumeCpp.find((c) => c.category2 === 'BASE FREIGHT')
    expect(bf).toBeDefined()
    expect(bf!.totalCost).toBeCloseTo(150, 6)
    // volumeUnits = max(1, packageQty) per line: 2 + 1 = 3
    expect(bf!.totalVolume).toBe(3)
    expect(bf!.totalCpp).toBeCloseTo(50, 6)
  })

  it('modeVolumeCpp groups by zone-derived mode', () => {
    const lookup = buildChargeDescriptionLookup([])
    const groundRow = invoiceRow({ 'Net Amount': '60', 'Invoice Amount': '60', 'Duty Amount': '0', 'Zone': '51', 'Package Quantity': '3' })
    const airRow = invoiceRow({ 'Net Amount': '90', 'Invoice Amount': '90', 'Duty Amount': '0', 'Zone': '301', 'Package Quantity': '3' })

    const summary = computeInvoiceAnalysisSummary([groundRow, airRow], lookup)
    const ground = summary.modeVolumeCpp.find((m) => m.mode === 'Ground')
    const air = summary.modeVolumeCpp.find((m) => m.mode === 'Air')
    expect(ground?.totalCost).toBeCloseTo(60, 6)
    expect(ground?.totalVolume).toBe(3)
    expect(air?.totalCost).toBeCloseTo(90, 6)
    expect(air?.totalVolume).toBe(3)
  })

  it('weightBucketVolume groups by weight bucket', () => {
    const lookup = buildChargeDescriptionLookup([])
    const light = invoiceRow({ 'Net Amount': '10', 'Invoice Amount': '10', 'Duty Amount': '0', 'Billed Weight': '0.5', 'Package Quantity': '1' })
    const heavy = invoiceRow({ 'Net Amount': '40', 'Invoice Amount': '40', 'Duty Amount': '0', 'Billed Weight': '15', 'Package Quantity': '2' })

    const summary = computeInvoiceAnalysisSummary([light, heavy], lookup)
    const b1 = summary.weightBucketVolume.find((w) => w.weightBucket === '0-1 lbs')
    const b11 = summary.weightBucketVolume.find((w) => w.weightBucket === '11-20 lbs')
    expect(b1?.totalCost).toBeCloseTo(10, 6)
    expect(b1?.totalVolume).toBe(1)
    expect(b11?.totalCost).toBeCloseTo(40, 6)
    expect(b11?.totalVolume).toBe(2)
  })
})

describe('computeInvoiceAnalysisSummary — dailySpend cost splits', () => {
  it('dailySpend tracks fuel, surcharge, and accessorial breakdowns per date', () => {
    const fuelMapping: ChargeDescriptionMappingRow = {
      carrier: 'UPS',
      charge_description: 'Fuel Surcharge',
      transportation_mode: 'Other',
      category_1: '',
      category_2: '',
      category_3: 'FUEL SURCHARGE',
      category_4: '',
      category_5: '',
    }
    const lookup = buildChargeDescriptionLookup([fuelMapping])

    const freight = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-05-01',
      'Net Amount': '80',
      'Invoice Amount': '80',
      'Duty Amount': '0',
      'Charge Classification Code': 'SHP',
      'Charge Category Code': 'IMP',
      'Charge Description': 'Ground',
    })
    const fuel = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-05-01',
      'Net Amount': '12',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': 'SHP',
      'Charge Category Code': 'IMP',
      'Charge Description': 'Fuel Surcharge',
    })
    const acc = invoiceRow({
      'Carrier Name': 'UPS',
      'Invoice Date': '2025-05-01',
      'Net Amount': '5',
      'Invoice Amount': '0',
      'Duty Amount': '0',
      'Charge Classification Code': 'ACC',
      'Charge Category Code': 'RES',
      'Charge Description': 'Residential',
    })

    const summary = computeInvoiceAnalysisSummary([freight, fuel, acc], lookup)
    const day = summary.dailySpend.find((d) => d.date === '2025-05-01')
    expect(day?.totalCost).toBeCloseTo(97, 6)
    expect(day?.costFuel).toBeCloseTo(12, 6)
    expect(day?.costSurcharges).toBeCloseTo(12, 6)
    expect(day?.costAccessorials).toBeCloseTo(5, 6)
  })
})

describe('computeInvoiceAnalysisSummary — spendByInvoice no-account fallback', () => {
  it('uses "(no account)" when account number is blank', () => {
    const lookup = buildChargeDescriptionLookup([])
    const row = invoiceRow({
      'Invoice Number': 'INV-X',
      'Invoice Date': '2025-06-01',
      'Account Number': '',
      'Net Amount': '25',
      'Invoice Amount': '25',
      'Duty Amount': '0',
    })
    const summary = computeInvoiceAnalysisSummary([row], lookup)
    expect(summary.spendByInvoice).toHaveLength(1)
    expect(summary.spendByInvoice[0]?.accountNumber).toBe('(no account)')
    expect(summary.spendByInvoice[0]?.totalCost).toBeCloseTo(25, 6)
  })
})
