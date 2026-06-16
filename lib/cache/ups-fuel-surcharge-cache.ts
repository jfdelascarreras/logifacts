import { redis } from '@/lib/cache/redis'
import { parseFuelSurchargeFromHtml, type LiveFuelRates } from '@/lib/pricing/ups-fuel-surcharge'
import { resolveUpsFuelFromEia } from '@/lib/pricing/ups-fuel-from-eia'
import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'

export const FUEL_SURCHARGE_REDIS_KEY = 'ups:fuel-surcharge'
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days — rate changes every Monday

const UPS_URL =
  process.env.UPS_FUEL_SURCHARGE_URL ??
  'https://www.ups.com/us/en/support/shipping-support/shipping-costs-rates/fuel-surcharges.page'

export type FuelSurchargeSource = 'cache' | 'live' | 'eia' | 'fallback'

export type ResolvedFuelRates = LiveFuelRates & { source: FuelSurchargeSource }

let inflightLiveFetch: Promise<LiveFuelRates | null> | null = null

function isValidRates(rates: LiveFuelRates): boolean {
  return (
    typeof rates.ground === 'number' && rates.ground > 0 && rates.ground < 1 &&
    typeof rates.air === 'number' && rates.air > 0 && rates.air < 1
  )
}

function fallbackFromHistory(): LiveFuelRates | null {
  const history = loadFuelSurchargeHistory()
  if (history.length === 0) return null
  const latest = history[0]!
  return { ground: latest.domesticGround, air: latest.domesticAir }
}

async function fetchLiveFromUpsHtml(): Promise<LiveFuelRates | null> {
  const res = await fetch(UPS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Logifacts/1.0)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const html = await res.text()
  return parseFuelSurchargeFromHtml(html)
}

async function fetchLiveRates(): Promise<LiveFuelRates | null> {
  const fromHtml = await fetchLiveFromUpsHtml()
  if (fromHtml && isValidRates(fromHtml)) return fromHtml

  const fromEia = await resolveUpsFuelFromEia()
  if (fromEia && isValidRates(fromEia)) return fromEia

  return null
}

async function fetchAndCacheLive(): Promise<LiveFuelRates | null> {
  if (inflightLiveFetch) return inflightLiveFetch

  inflightLiveFetch = (async () => {
    try {
      const fromHtml = await fetchLiveFromUpsHtml()
      if (fromHtml && isValidRates(fromHtml)) {
        try {
          await redis?.set(FUEL_SURCHARGE_REDIS_KEY, fromHtml, { ex: TTL_SECONDS })
        } catch {
          // Cache write failure is non-fatal
        }
        return fromHtml
      }

      const fromEia = await resolveUpsFuelFromEia()
      if (fromEia && isValidRates(fromEia)) {
        const rates = { ground: fromEia.ground, air: fromEia.air }
        try {
          await redis?.set(FUEL_SURCHARGE_REDIS_KEY, rates, { ex: TTL_SECONDS })
        } catch {
          // Cache write failure is non-fatal
        }
        return rates
      }

      return null
    } finally {
      inflightLiveFetch = null
    }
  })()

  return inflightLiveFetch
}

/**
 * Resolves current UPS domestic fuel surcharge rates.
 * Order: Redis cache → UPS HTML scrape → EIA index lookup → history JSON fallback.
 */
export async function resolveFuelSurchargeRates(options?: {
  warmCache?: boolean
}): Promise<ResolvedFuelRates | null> {
  try {
    const cached = await redis?.get<LiveFuelRates>(FUEL_SURCHARGE_REDIS_KEY)
    if (cached && isValidRates(cached)) {
      return { ...cached, source: 'cache' }
    }
  } catch {
    // Redis unavailable — continue
  }

  if (options?.warmCache) {
    try {
      const fromHtml = await fetchLiveFromUpsHtml()
      if (fromHtml && isValidRates(fromHtml)) {
        return { ...fromHtml, source: 'live' }
      }

      const fromEia = await resolveUpsFuelFromEia()
      if (fromEia && isValidRates(fromEia)) {
        return { ground: fromEia.ground, air: fromEia.air, source: 'eia' }
      }
    } catch {
      // Network/parse failure — fall through to history
    }
  }

  const fallback = fallbackFromHistory()
  if (fallback) {
    if (!options?.warmCache) {
      void fetchAndCacheLive().catch(() => {})
    }
    return { ...fallback, source: 'fallback' }
  }

  return null
}

/** @internal Exposed for tests — resolves live path without cache/history. */
export async function resolveUpsFuelLiveForTests(): Promise<ResolvedFuelRates | null> {
  const fromHtml = await fetchLiveFromUpsHtml()
  if (fromHtml) return { ...fromHtml, source: 'live' }
  const fromEia = await resolveUpsFuelFromEia()
  if (fromEia) return { ground: fromEia.ground, air: fromEia.air, source: 'eia' }
  return null
}
