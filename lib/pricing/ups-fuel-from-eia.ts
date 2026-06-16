import {
  fetchEiaDieselHistory,
  fetchEiaJetFuelGulfCoastHistory,
} from '@/lib/fuel-surcharges/eia'
import type { LiveFuelRates } from '@/lib/pricing/ups-fuel-surcharge'
import {
  loadUpsFuelIndexTables,
  lookupFuelSurchargeFromIndex,
  mondayOfWeek,
  pickEiaPriceBeforeMonday,
} from '@/lib/pricing/ups-fuel-index'

export type UpsFuelFromEiaResult = LiveFuelRates & {
  dieselPriceUsd: number
  jetPriceUsd: number
  effectiveMonday: string
}

/**
 * Derives UPS domestic ground/air fuel surcharges from EIA weekly prices + UPS index tables.
 * UPS applies the latest EIA release before each Monday effective date (verified Jun 2026).
 */
export async function resolveUpsFuelFromEia(): Promise<UpsFuelFromEiaResult | null> {
  const [dieselResult, jetResult] = await Promise.all([
    fetchEiaDieselHistory(),
    fetchEiaJetFuelGulfCoastHistory(),
  ])

  if (!dieselResult.ok || !jetResult.ok) return null

  const effectiveMonday = mondayOfWeek()
  const dieselPrice = pickEiaPriceBeforeMonday(dieselResult.data, effectiveMonday)
  const jetPrice = pickEiaPriceBeforeMonday(jetResult.data, effectiveMonday)

  if (dieselPrice == null || jetPrice == null) return null

  const tables = loadUpsFuelIndexTables()
  const ground = lookupFuelSurchargeFromIndex(tables.domesticGroundDiesel, dieselPrice)
  const air = lookupFuelSurchargeFromIndex(tables.domesticAirJet, jetPrice)

  if (ground == null || air == null) return null
  if (ground <= 0 || ground >= 1 || air <= 0 || air >= 1) return null

  return {
    ground,
    air,
    dieselPriceUsd: dieselPrice,
    jetPriceUsd: jetPrice,
    effectiveMonday,
  }
}
