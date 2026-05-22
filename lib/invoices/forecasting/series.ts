import { yearMonthKeyFromEngineMonthLabel } from '../analysis-summary'
import type { SpendObservation } from './types'

type MonthlySpendRow = {
  month: string
  totalCost: number
  costFuel?: number
  costAccessorials?: number
  costSurcharges?: number
}

export function extractBaseFreightSeries(
  monthlySpend: MonthlySpendRow[],
  fill: 'zero' | 'none' = 'zero'
): { series: SpendObservation[]; hadGaps: boolean } {
  const entries: SpendObservation[] = []

  for (const row of monthlySpend) {
    const period = yearMonthKeyFromEngineMonthLabel(row.month)
    if (!period) continue
    entries.push({
      period,
      value: row.totalCost - (row.costFuel ?? 0),
    })
  }

  // monthlySpend is newest-first — sort ascending for time series math
  entries.sort((a, b) => a.period.localeCompare(b.period))

  if (fill === 'none' || entries.length < 2) {
    return { series: entries, hadGaps: false }
  }

  // Fill missing months with 0
  const filled: SpendObservation[] = []
  let hadGaps = false
  for (let i = 0; i < entries.length; i++) {
    filled.push(entries[i]!)
    if (i < entries.length - 1) {
      const next = nextMonthPeriod(entries[i]!.period)
      if (next !== entries[i + 1]!.period) {
        hadGaps = true
        let cursor = next
        while (cursor < entries[i + 1]!.period) {
          filled.push({ period: cursor, value: 0 })
          cursor = nextMonthPeriod(cursor)
        }
      }
    }
  }

  return { series: filled, hadGaps }
}

export function nextMonthPeriod(period: string): string {
  const year = parseInt(period.slice(0, 4), 10)
  const month = parseInt(period.slice(5, 7), 10)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

export function nextMonthPeriods(lastPeriod: string, count: number): string[] {
  const periods: string[] = []
  let cursor = lastPeriod
  for (let i = 0; i < count; i++) {
    cursor = nextMonthPeriod(cursor)
    periods.push(cursor)
  }
  return periods
}
