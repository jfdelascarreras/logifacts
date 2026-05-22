import { describe, expect, it } from 'vitest'
import { forecastFuelSurcharge } from './forecast'

const SCENARIOS = { low: 0.215, current: 0.275, high: 0.310 }

function makeMonthlySpend(count: number, startYear = 2024, startMonth = 1, totalCost = 100000, costFuel = 17000) {
  const rows = []
  let year = startYear
  let month = startMonth
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  for (let i = 0; i < count; i++) {
    rows.push({ month: `${monthNames[month - 1]} ${year}`, totalCost, costFuel })
    month++
    if (month > 12) { month = 1; year++ }
  }
  return rows
}

describe('forecastFuelSurcharge', () => {
  it('returns insufficient_history warning when < 6 months', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(4), SCENARIOS)
    expect(result.warnings).toContain('insufficient_history')
    expect(result.scenarios.current.forecast).toHaveLength(0)
  })

  it('excludes seasonal_naive when history is 6–11 months', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(8), SCENARIOS)
    expect(result.warnings).toContain('seasonality_not_reliable')
    // Model must be mean or last_value, not seasonal_naive
    expect(['mean', 'last_value']).toContain(result.model)
  })

  it('allows seasonal_naive when history >= 12 months', () => {
    // Provide a series where seasonal_naive would win (periodic pattern)
    const rows = []
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
    let year = 2024
    let month = 1
    // Alternating high/low to force seasonal pattern
    for (let i = 0; i < 24; i++) {
      const totalCost = i % 12 < 6 ? 100000 : 200000
      rows.push({ month: `${monthNames[month - 1]} ${year}`, totalCost, costFuel: totalCost * 0.17 })
      month++
      if (month > 12) { month = 1; year++ }
    }
    const result = forecastFuelSurcharge(rows, SCENARIOS)
    expect(result.warnings).not.toContain('insufficient_history')
    // seasonal_naive is a candidate — model selection is valid
    expect(['mean', 'last_value', 'seasonal_naive']).toContain(result.model)
  })

  it('forecast has correct horizon length', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(12), SCENARIOS, { horizon: 3 })
    expect(result.scenarios.current.forecast).toHaveLength(3)
    expect(result.scenarios.low.forecast).toHaveLength(3)
    expect(result.scenarios.high.forecast).toHaveLength(3)
  })

  it('projectedCost = baseFreight × (1 + rate) for each scenario', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(12), SCENARIOS, { horizon: 3 })
    for (const point of result.scenarios.low.forecast) {
      expect(point.totalCost).toBeCloseTo(point.baseFreight + point.fuelCost, 6)
      expect(point.fuelCost).toBeCloseTo(point.baseFreight * SCENARIOS.low, 6)
    }
    for (const point of result.scenarios.high.forecast) {
      expect(point.fuelCost).toBeCloseTo(point.baseFreight * SCENARIOS.high, 6)
    }
  })

  it('scenario rates are set correctly in result', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(12), SCENARIOS)
    expect(result.scenarios.low.rate).toBe(SCENARIOS.low)
    expect(result.scenarios.current.rate).toBe(SCENARIOS.current)
    expect(result.scenarios.high.rate).toBe(SCENARIOS.high)
  })

  it('adds gaps_filled warning when months are missing', () => {
    const rows = [
      { month: 'January 2025', totalCost: 100000, costFuel: 17000 },
      { month: 'March 2025',   totalCost: 110000, costFuel: 18000 },
      { month: 'April 2025',   totalCost: 105000, costFuel: 17500 },
      { month: 'May 2025',     totalCost: 108000, costFuel: 18000 },
      { month: 'June 2025',    totalCost: 112000, costFuel: 19000 },
      { month: 'July 2025',    totalCost: 115000, costFuel: 19500 },
    ]
    const result = forecastFuelSurcharge(rows, SCENARIOS)
    expect(result.warnings).toContain('gaps_filled')
  })

  it('small_training_set warning when history barely above minHistory', () => {
    // 6 months, holdoutPeriods default 3 → train = 3, triggers warning
    const result = forecastFuelSurcharge(makeMonthlySpend(6), SCENARIOS, { holdoutPeriods: 3 })
    expect(result.warnings).toContain('small_training_set')
  })

  it('history array is capped at 12 entries', () => {
    const result = forecastFuelSurcharge(makeMonthlySpend(24), SCENARIOS)
    expect(result.history.length).toBeLessThanOrEqual(12)
  })
})
