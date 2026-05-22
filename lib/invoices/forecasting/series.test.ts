import { describe, expect, it } from 'vitest'
import { extractBaseFreightSeries, nextMonthPeriod, nextMonthPeriods } from './series'

function row(month: string, totalCost: number, costFuel = 0) {
  return { month, totalCost, costFuel }
}

describe('nextMonthPeriod', () => {
  it('increments month within year', () => {
    expect(nextMonthPeriod('2025-01')).toBe('2025-02')
    expect(nextMonthPeriod('2025-11')).toBe('2025-12')
  })
  it('rolls over December to January next year', () => {
    expect(nextMonthPeriod('2025-12')).toBe('2026-01')
  })
})

describe('nextMonthPeriods', () => {
  it('returns N consecutive months', () => {
    expect(nextMonthPeriods('2025-10', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('extractBaseFreightSeries', () => {
  it('converts "March 2025" labels to YYYY-MM and sorts ascending', () => {
    const spend = [
      row('April 2025', 200, 20),
      row('March 2025', 100, 10),
    ]
    const { series } = extractBaseFreightSeries(spend, 'none')
    expect(series.map((s) => s.period)).toEqual(['2025-03', '2025-04'])
  })

  it('value = totalCost - costFuel', () => {
    const spend = [row('January 2025', 150, 30)]
    const { series } = extractBaseFreightSeries(spend, 'none')
    expect(series[0]?.value).toBe(120)
  })

  it('skips rows with unparseable month labels', () => {
    const spend = [
      row('January 2025', 100, 10),
      row('Bad Label', 999, 0),
    ]
    const { series } = extractBaseFreightSeries(spend, 'none')
    expect(series).toHaveLength(1)
    expect(series[0]?.period).toBe('2025-01')
  })

  it('fills missing months with 0 and sets hadGaps=true', () => {
    const spend = [
      row('January 2025', 100, 10),
      row('March 2025', 200, 20),
    ]
    const { series, hadGaps } = extractBaseFreightSeries(spend, 'zero')
    expect(hadGaps).toBe(true)
    expect(series.map((s) => s.period)).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(series[1]?.value).toBe(0)
  })

  it('no gaps = hadGaps false', () => {
    const spend = [
      row('January 2025', 100, 10),
      row('February 2025', 200, 20),
    ]
    const { hadGaps } = extractBaseFreightSeries(spend, 'zero')
    expect(hadGaps).toBe(false)
  })
})
