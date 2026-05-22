import type { SpendObservation } from './types'

export function mape(actual: number[], predicted: number[]): number | null {
  if (actual.length === 0 || actual.length !== predicted.length) return null
  let sum = 0
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) return null  // undefined when actual is zero
    sum += Math.abs((actual[i]! - predicted[i]!) / actual[i]!)
  }
  return sum / actual.length
}

export function trainHoldoutSplit(
  series: SpendObservation[],
  holdoutPeriods: number
): { train: SpendObservation[]; holdout: SpendObservation[] } {
  const splitAt = Math.max(0, series.length - holdoutPeriods)
  return {
    train: series.slice(0, splitAt),
    holdout: series.slice(splitAt),
  }
}
