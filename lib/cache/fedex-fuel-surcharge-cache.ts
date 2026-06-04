import { redis } from '@/lib/cache/redis'
import {
  parseFedExFuelSurchargeFromHtml,
  type FedExLiveFuelRates,
} from '@/lib/pricing/fedex-fuel-surcharge'
import { loadFedExFuelSurchargeHistory } from '@/lib/pricing/fedex-fuel-surcharge-history'

export const FEDEX_FUEL_SURCHARGE_REDIS_KEY = 'fedex:fuel-surcharge'
const TTL_SECONDS = 7 * 24 * 60 * 60

// NOTE: /current-rates/fuel-surcharges.html (spec URL) returns 404. Correct URL verified June 2026.
const FEDEX_URL =
  process.env.FEDEX_FUEL_SURCHARGE_URL ??
  'https://www.fedex.com/en-us/shipping/fuel-surcharge.html'

// FedEx WAF requires a realistic browser User-Agent and Accept headers.
// Node.js server-side fetch uses HTTP/2 + a different TLS fingerprint from
// curl, which is typically enough to pass FedEx's WAF checks.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

export type FedExFuelSurchargeSource = 'cache' | 'live' | 'fallback'
export type ResolvedFedExFuelRates = FedExLiveFuelRates & { source: FedExFuelSurchargeSource }

function isValid(rates: FedExLiveFuelRates): boolean {
  return (
    typeof rates.ground === 'number' && rates.ground > 0.01 && rates.ground < 1 &&
    typeof rates.express === 'number' && rates.express > 0.01 && rates.express < 1
  )
}

function fallbackFromHistory(): FedExLiveFuelRates | null {
  const history = loadFedExFuelSurchargeHistory()
  if (history.length === 0) return null
  const latest = history[0]!
  return { ground: latest.ground, express: latest.express }
}

let inflightFetch: Promise<FedExLiveFuelRates | null> | null = null

async function fetchAndCacheLive(): Promise<FedExLiveFuelRates | null> {
  if (inflightFetch) return inflightFetch

  inflightFetch = (async () => {
    try {
      const res = await fetch(FEDEX_URL, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return null
      const html = await res.text()
      const rates = parseFedExFuelSurchargeFromHtml(html)
      if (rates && isValid(rates)) {
        try {
          await redis?.set(FEDEX_FUEL_SURCHARGE_REDIS_KEY, rates, { ex: TTL_SECONDS })
        } catch {
          // Cache write failure is non-fatal
        }
        return rates
      }
      return null
    } catch {
      return null
    } finally {
      inflightFetch = null
    }
  })()

  return inflightFetch
}

export async function resolveFedExFuelSurchargeRates(options?: {
  warmCache?: boolean
}): Promise<ResolvedFedExFuelRates | null> {
  try {
    const cached = await redis?.get<FedExLiveFuelRates>(FEDEX_FUEL_SURCHARGE_REDIS_KEY)
    if (cached && isValid(cached)) return { ...cached, source: 'cache' }
  } catch {
    // Redis unavailable
  }

  if (options?.warmCache) {
    try {
      const live = await fetchAndCacheLive()
      if (live) return { ...live, source: 'live' }
    } catch {
      // Network / parse failure — fall through
    }
  } else {
    // Warm cache in background so next request hits Redis
    void fetchAndCacheLive().catch(() => {})
  }

  const fallback = fallbackFromHistory()
  if (fallback) return { ...fallback, source: 'fallback' }

  return null
}
