import indexTables from '@/lib/pricing/data/ups-fuel-index-tables.json'

export type FuelIndexTable = {
  stepUsd: number
  stepPct: number
  floorMinUsd: number
  floorSurcharge: number
  rows: Array<{ min: number; max: number; surcharge: number }>
}

export type UpsFuelIndexTables = {
  domesticGroundDiesel: FuelIndexTable
  domesticAirJet: FuelIndexTable
}

export function loadUpsFuelIndexTables(): UpsFuelIndexTables {
  return indexTables as UpsFuelIndexTables
}

/**
 * Map a fuel price ($/gal) to UPS surcharge fraction using published index brackets.
 * Extends above the top row in stepUsd / stepPct increments (UPS published rule).
 */
export function lookupFuelSurchargeFromIndex(
  table: FuelIndexTable,
  priceUsd: number,
): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null

  for (const row of table.rows) {
    if (priceUsd >= row.min && priceUsd < row.max) {
      return row.surcharge
    }
  }

  const top = table.rows.at(-1)
  if (top && priceUsd >= top.max) {
    const steps = Math.ceil((priceUsd - top.max) / table.stepUsd)
    return top.surcharge + steps * table.stepPct
  }

  if (priceUsd < table.floorMinUsd) {
    const steps = Math.ceil((table.floorMinUsd - priceUsd) / table.stepUsd)
    return Math.max(0, table.floorSurcharge - steps * table.stepPct)
  }

  return null
}

/** Monday (ISO date) of the week containing `date`. */
export function mondayOfWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** Latest EIA observation strictly before `effectiveMonday` (UPS weekly lag). */
export function pickEiaPriceBeforeMonday(
  observations: Array<{ period: string; value: number }>,
  effectiveMonday: string,
): number | null {
  for (const row of observations) {
    if (row.period < effectiveMonday) return row.value
  }
  return null
}
