import { describe, expect, it } from 'vitest'
import { predictMean, predictLastValue, predictSeasonalNaive } from './baselines'
import type { SpendObservation } from './types'

function makeSeries(values: number[], startPeriod = '2024-01'): SpendObservation[] {
  const result: SpendObservation[] = []
  let year = parseInt(startPeriod.slice(0, 4), 10)
  let month = parseInt(startPeriod.slice(5, 7), 10)
  for (const value of values) {
    result.push({ period: `${year}-${String(month).padStart(2, '0')}`, value })
    month++
    if (month > 12) { month = 1; year++ }
  }
  return result
}

describe('predictMean', () => {
  it('returns mean of training set repeated for horizon', () => {
    const train = makeSeries([100, 200, 300])
    const result = predictMean(train, 3)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.value === 200)).toBe(true)
  })

  it('periods follow on from last training period', () => {
    const train = makeSeries([100], '2025-11')
    const result = predictMean(train, 2)
    expect(result.map((r) => r.period)).toEqual(['2025-12', '2026-01'])
  })

  it('returns empty for empty train', () => {
    expect(predictMean([], 3)).toHaveLength(0)
  })
})

describe('predictLastValue', () => {
  it('repeats last training value', () => {
    const train = makeSeries([100, 200, 350])
    const result = predictLastValue(train, 3)
    expect(result.every((r) => r.value === 350)).toBe(true)
    expect(result).toHaveLength(3)
  })
})

describe('predictSeasonalNaive', () => {
  it('copies value from 12 months ago for each forecast period', () => {
    // 24 months: Jan 2024 – Dec 2025
    const values = Array.from({ length: 24 }, (_, i) => (i + 1) * 100)
    const train = makeSeries(values, '2024-01')
    // Last period is 2025-12, value=2400
    // Forecast Jan 2026 should copy Jan 2025 = train[12] = 1300
    const result = predictSeasonalNaive(train, 3)
    expect(result).toHaveLength(3)
    expect(result[0]?.period).toBe('2026-01')
    expect(result[0]?.value).toBe(train[12]?.value)  // Jan 2025
    expect(result[1]?.period).toBe('2026-02')
    expect(result[1]?.value).toBe(train[13]?.value)  // Feb 2025
    expect(result[2]?.period).toBe('2026-03')
    expect(result[2]?.value).toBe(train[14]?.value)  // Mar 2025
  })

  it('returns empty when train < 12 months', () => {
    const train = makeSeries(Array(11).fill(100))
    expect(predictSeasonalNaive(train, 3)).toHaveLength(0)
  })
})
