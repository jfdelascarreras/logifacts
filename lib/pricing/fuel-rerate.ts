import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'
import type { FuelRateObservation } from '@/lib/pricing/ups-fuel-surcharge-history'

export type FuelRerateInput = {
  tracking_number: string
  ship_date: string
  service: string
  transport_charge: number
  billed_fuel_surcharge: number
}

export type FuelRerateResult = FuelRerateInput & {
  rate_used: number | null
  expected_fuel: number | null
  variance: number | null
  flag: 'overbilled' | 'underbilled' | 'correct' | 'no_rate'
}

export function findFuelRateForDate(
  history: FuelRateObservation[],
  date: string
): { ground: number; air: number } | null {
  const entry = history.find((h) => h.effectiveDate <= date)
  if (!entry) return null
  return { ground: entry.domesticGround, air: entry.domesticAir }
}

export function isAirFuelService(service: string): boolean {
  return /air|2\s*day|3\s*day|next.?day|nda|express|priority/i.test(service)
}

/** Flag when billed fuel exceeds published rate by more than 0.5 percentage points of transport. */
export function rerateFuelRow(
  row: FuelRerateInput,
  history: FuelRateObservation[] = loadFuelSurchargeHistory()
): FuelRerateResult {
  const rates = findFuelRateForDate(history, row.ship_date)
  if (!rates) {
    return { ...row, rate_used: null, expected_fuel: null, variance: null, flag: 'no_rate' }
  }

  const rate = isAirFuelService(row.service) ? rates.air : rates.ground
  const expectedFuel = +(row.transport_charge * rate).toFixed(2)
  const variance = +(row.billed_fuel_surcharge - expectedFuel).toFixed(2)

  let flag: FuelRerateResult['flag']
  if (variance > 1.0) flag = 'overbilled'
  else if (variance < -1.0) flag = 'underbilled'
  else flag = 'correct'

  return { ...row, rate_used: rate, expected_fuel: expectedFuel, variance, flag }
}
