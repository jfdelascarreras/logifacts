import fs from 'node:fs'
import path from 'node:path'

export type FuelSurchargeType =
  | 'all'
  | 'domesticGround'
  | 'domesticAir'
  | 'intlAirExport'
  | 'intlAirImport'
  | 'intlGroundExportImport'

export type FuelRateObservation = {
  effectiveDate: string
  domesticGround: number
  domesticAir: number
  intlAirExport: number
  intlAirImport: number
  intlGroundExportImport: number
}

export type FuelScenarios = { low: number; current: number; high: number }

export function loadFuelSurchargeHistory(): FuelRateObservation[] {
  const filePath = path.join(process.cwd(), 'lib/pricing/data/ups-fuel-surcharge-history.json')
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FuelRateObservation[]
  } catch {
    return []
  }
}

const ALL_TYPES: Exclude<FuelSurchargeType, 'all'>[] = [
  'domesticGround', 'domesticAir', 'intlAirExport', 'intlAirImport', 'intlGroundExportImport',
]

function avgRate(r: FuelRateObservation): number {
  return ALL_TYPES.reduce((sum, t) => sum + r[t], 0) / ALL_TYPES.length
}

export function deriveFuelScenarios(
  history: FuelRateObservation[],
  type: FuelSurchargeType
): FuelScenarios {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const getRate = type === 'all'
    ? (r: FuelRateObservation) => avgRate(r)
    : (r: FuelRateObservation) => r[type]

  const recent = history
    .filter((r) => r.effectiveDate >= cutoffStr)
    .map(getRate)

  if (recent.length === 0) {
    const fallback = history.length > 0 ? getRate(history[0]!) : 0.172
    return { low: fallback, current: fallback, high: fallback }
  }

  const current = getRate(history[0]!)
  const low = Math.min(...recent)
  const high = Math.max(...recent)

  return { low, current, high }
}
