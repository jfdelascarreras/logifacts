export type SpendObservation = {
  period: string  // YYYY-MM
  value: number
}

export type ScenarioForecastPoint = {
  period: string
  baseFreight: number
  fuelCost: number
  totalCost: number
}

export type ForecastSpendOptions = {
  horizon?: number          // default 3
  holdoutPeriods?: number   // default 3
  minHistory?: number       // default 6
  fillMissingMonths?: 'zero' | 'none'  // default 'zero'
}

export type FuelScenarios = {
  low: number
  current: number
  high: number
}

export type FuelForecastResult = {
  history: Array<{
    period: string
    baseFreight: number
    fuelCost: number
    totalCost: number
  }>
  scenarios: {
    low:     { rate: number; forecast: ScenarioForecastPoint[] }
    current: { rate: number; forecast: ScenarioForecastPoint[] }
    high:    { rate: number; forecast: ScenarioForecastPoint[] }
  }
  model: 'mean' | 'seasonal_naive' | 'last_value'
  metrics: { mape: number | null; holdoutPeriods: number }
  warnings: string[]
}
