import type { SpendObservation } from './types'
import { nextMonthPeriods } from './series'

export function predictMean(
  train: SpendObservation[],
  horizon: number
): SpendObservation[] {
  if (train.length === 0) return []
  const mean = train.reduce((s, r) => s + r.value, 0) / train.length
  const lastPeriod = train[train.length - 1]!.period
  return nextMonthPeriods(lastPeriod, horizon).map((period) => ({ period, value: mean }))
}

export function predictLastValue(
  train: SpendObservation[],
  horizon: number
): SpendObservation[] {
  if (train.length === 0) return []
  const last = train[train.length - 1]!.value
  const lastPeriod = train[train.length - 1]!.period
  return nextMonthPeriods(lastPeriod, horizon).map((period) => ({ period, value: last }))
}

// Requires train.length >= 12 — caller must enforce this
export function predictSeasonalNaive(
  train: SpendObservation[],
  horizon: number
): SpendObservation[] {
  if (train.length < 12) return []
  const lastPeriod = train[train.length - 1]!.period
  return nextMonthPeriods(lastPeriod, horizon).map((period, i) => {
    // Copy from same month 12 periods back in the full train array
    const sourceIdx = train.length - 12 + (i % 12)
    const value = sourceIdx >= 0 ? (train[sourceIdx]?.value ?? 0) : 0
    return { period, value }
  })
}
