import type { ForecastSpendOptions, FuelForecastResult, FuelScenarios, ScenarioForecastPoint, SpendObservation } from './types'
import { extractBaseFreightSeries } from './series'
import { mape, trainHoldoutSplit } from './metrics'
import { predictMean, predictLastValue, predictSeasonalNaive } from './baselines'

type MonthlySpendRow = {
  month: string
  totalCost: number
  costFuel?: number
}

type BaselineCandidate = {
  name: 'mean' | 'last_value' | 'seasonal_naive'
  predict: (train: SpendObservation[], horizon: number) => SpendObservation[]
}

function applyScenario(
  projectedBase: SpendObservation[],
  rate: number
): ScenarioForecastPoint[] {
  return projectedBase.map((p) => {
    const fuelCost = p.value * rate
    return { period: p.period, baseFreight: p.value, fuelCost, totalCost: p.value + fuelCost }
  })
}

export function forecastFuelSurcharge(
  monthlySpend: MonthlySpendRow[],
  scenarios: FuelScenarios,
  options: ForecastSpendOptions = {}
): FuelForecastResult {
  const horizon = options.horizon ?? 3
  const minHistory = options.minHistory ?? 6
  const fill = options.fillMissingMonths ?? 'zero'

  const warnings: string[] = []

  const { series, hadGaps } = extractBaseFreightSeries(monthlySpend, fill)
  if (hadGaps) warnings.push('gaps_filled')

  const emptyResult = (): FuelForecastResult => ({
    history: [],
    scenarios: {
      low:     { rate: scenarios.low,     forecast: [] },
      current: { rate: scenarios.current, forecast: [] },
      high:    { rate: scenarios.high,    forecast: [] },
    },
    model: 'mean',
    metrics: { mape: null, holdoutPeriods: 0 },
    warnings,
  })

  if (series.length < minHistory) {
    warnings.push('insufficient_history')
    return emptyResult()
  }

  // Reduce holdoutPeriods if training set would be too small
  let holdoutPeriods = options.holdoutPeriods ?? 3
  if (series.length - holdoutPeriods <= 3) {
    holdoutPeriods = Math.max(1, series.length - 3)
    warnings.push('small_training_set')
  }

  if (series.length < 12) warnings.push('seasonality_not_reliable')

  const { train, holdout } = trainHoldoutSplit(series, holdoutPeriods)

  const candidates: BaselineCandidate[] = [
    { name: 'mean',       predict: predictMean },
    { name: 'last_value', predict: predictLastValue },
  ]
  if (train.length >= 12) {
    candidates.push({ name: 'seasonal_naive', predict: predictSeasonalNaive })
  }

  // Evaluate each candidate on holdout
  let bestName: FuelForecastResult['model'] = 'mean'
  let bestMape: number | null = null

  for (const candidate of candidates) {
    const predicted = candidate.predict(train, holdout.length)
    const actualVals = holdout.map((p) => p.value)
    const predictedVals = predicted.map((p) => p.value)
    const score = mape(actualVals, predictedVals)
    if (score !== null && (bestMape === null || score < bestMape)) {
      bestMape = score
      bestName = candidate.name
    }
  }

  // Retrain winner on full series
  const winner = candidates.find((c) => c.name === bestName)!
  const projectedBase = winner.predict(series, horizon)

  // Build history (last 12 months for chart readability)
  const historySlice = series.slice(-12)
  const history = historySlice.map((p) => ({
    period: p.period,
    baseFreight: p.value,
    fuelCost: monthlySpend.find((r) => {
      // try to match back to original costFuel for history accuracy
      const key = yearMonthKey(r.month)
      return key === p.period
    })?.costFuel ?? p.value * scenarios.current,
    totalCost: monthlySpend.find((r) => yearMonthKey(r.month) === p.period)?.totalCost ?? p.value * (1 + scenarios.current),
  }))

  return {
    history,
    scenarios: {
      low:     { rate: scenarios.low,     forecast: applyScenario(projectedBase, scenarios.low) },
      current: { rate: scenarios.current, forecast: applyScenario(projectedBase, scenarios.current) },
      high:    { rate: scenarios.high,    forecast: applyScenario(projectedBase, scenarios.high) },
    },
    model: bestName,
    metrics: { mape: bestMape, holdoutPeriods },
    warnings,
  }
}

// Inline helper to avoid circular import
function yearMonthKey(monthLabel: string): string | null {
  const m = String(monthLabel ?? '').trim().match(/^(.+?)\s+(\d{4})$/)
  if (!m) return null
  const d = new Date(`${m[1]!.trim()} 1, ${m[2]}`)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
