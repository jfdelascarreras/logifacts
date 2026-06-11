import { describe, expect, it } from 'vitest'

import type { InvoiceRecord } from '@/lib/invoices/csv'
import {
  buildSpendShipmentPeriodMatrix,
  isoWeekYearFromDateKey,
  shipmentIdentityKey,
} from './period-averages-matrix'

function row(overrides: Partial<Record<string, string>>): InvoiceRecord {
  return {
    'Invoice Date': '2025-03-15',
    'Net Amount': '10',
    'Invoice Number': 'INV-1',
    'Tracking Number': '1Z999',
    'Package Quantity': '1',
    'Carrier Name': 'UPS',
    ...overrides,
  } as InvoiceRecord
}

describe('shipmentIdentityKey', () => {
  it('uses tracking dedupe key when present', () => {
    expect(shipmentIdentityKey(row({}))).toBe('INV-1::1Z999')
  })
})

describe('isoWeekYearFromDateKey', () => {
  it('returns ISO week for mid-March 2025', () => {
    const { isoYear, weekOfYear } = isoWeekYearFromDateKey('2025-03-15')
    expect(isoYear).toBe(2025)
    expect(weekOfYear).toBeGreaterThan(0)
    expect(weekOfYear).toBeLessThanOrEqual(53)
  })
})

describe('buildSpendShipmentPeriodMatrix', () => {
  it('aggregates spend and distinct shipments by year and month', () => {
    const matrix = buildSpendShipmentPeriodMatrix([
      row({ 'Net Amount': '100', 'Tracking Number': 'A' }),
      row({ 'Net Amount': '50', 'Tracking Number': 'A' }),
      row({ 'Net Amount': '25', 'Invoice Date': '2025-03-16', 'Tracking Number': 'B' }),
      row({ 'Net Amount': '40', 'Invoice Date': '2025-04-01', 'Tracking Number': 'C' }),
    ])

    expect(matrix.years).toEqual([2025])
    const year = matrix.byYear[0]!
    expect(year.totalSpend).toBe(215)
    expect(year.totalShipments).toBe(3)
    expect(year.activeDays).toBe(3)
    expect(year.avgSpend).toBeCloseTo(215 / 3)
    expect(year.avgShipments).toBeCloseTo(1)

    const march = matrix.byYearMonth.find((m) => m.month === 3)!
    expect(march.totalSpend).toBe(175)
    expect(march.totalShipments).toBe(2)
  })
})
