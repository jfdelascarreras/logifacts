import { describe, it, expect } from 'vitest'

import {
  lookupFuelSurchargeFromIndex,
  loadUpsFuelIndexTables,
  mondayOfWeek,
  pickEiaPriceBeforeMonday,
} from './ups-fuel-index'

describe('lookupFuelSurchargeFromIndex', () => {
  const tables = loadUpsFuelIndexTables()

  it('maps diesel $5.21 to 26.50% ground (June 2026 week)', () => {
    const pct = lookupFuelSurchargeFromIndex(tables.domesticGroundDiesel, 5.21)
    expect(pct).toBeCloseTo(0.265)
  })

  it('maps jet $3.371 to 27.50% air', () => {
    const pct = lookupFuelSurchargeFromIndex(tables.domesticAirJet, 3.371)
    expect(pct).toBeCloseTo(0.275)
  })

  it('extends above published diesel table', () => {
    const pct = lookupFuelSurchargeFromIndex(tables.domesticGroundDiesel, 6.0)
    expect(pct).toBeGreaterThan(0.2825)
  })
})

describe('pickEiaPriceBeforeMonday', () => {
  const obs = [
    { period: '2026-06-15', value: 5.059 },
    { period: '2026-06-08', value: 5.21 },
    { period: '2026-06-01', value: 5.35 },
  ]

  it('uses latest EIA row before effective Monday', () => {
    expect(pickEiaPriceBeforeMonday(obs, '2026-06-15')).toBe(5.21)
    expect(pickEiaPriceBeforeMonday(obs, '2026-06-08')).toBe(5.35)
  })
})

describe('mondayOfWeek', () => {
  it('returns ISO Monday for a mid-week date', () => {
    expect(mondayOfWeek(new Date('2026-06-16T12:00:00Z'))).toBe('2026-06-15')
  })
})
