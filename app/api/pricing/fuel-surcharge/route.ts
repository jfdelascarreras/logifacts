import { NextResponse } from 'next/server'

import { redis } from '@/lib/cache/redis'
import { parseFuelSurchargeFromHtml } from '@/lib/pricing/ups-fuel-surcharge'
import type { LiveFuelRates } from '@/lib/pricing/ups-fuel-surcharge'
import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'

const REDIS_KEY = 'ups:fuel-surcharge'
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days — rate changes every Monday

const UPS_URL =
  process.env.UPS_FUEL_SURCHARGE_URL ??
  'https://www.ups.com/us/en/support/shipping-support/shipping-costs-rates/fuel-surcharges.page'

function fallbackFromHistory(): LiveFuelRates | null {
  const history = loadFuelSurchargeHistory()
  if (history.length === 0) return null
  const latest = history[0]!
  return { ground: latest.domesticGround, air: latest.domesticAir }
}

export async function GET() {
  // 1. Return cached rate if available
  try {
    const cached = await redis?.get<LiveFuelRates>(REDIS_KEY)
    if (cached) {
      return NextResponse.json({ ...cached, source: 'cache' })
    }
  } catch {
    // Redis unavailable — continue to live fetch
  }

  // 2. Fetch live rate from UPS
  try {
    const html = await fetch(UPS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Logifacts/1.0)' },
      signal: AbortSignal.timeout(10_000),
    }).then(r => r.text())

    const rates = parseFuelSurchargeFromHtml(html)
    if (rates) {
      try {
        await redis?.set(REDIS_KEY, rates, { ex: TTL_SECONDS })
      } catch {
        // Cache write failure is non-fatal
      }
      return NextResponse.json({ ...rates, source: 'live' })
    }
  } catch {
    // Network error or parse failure — fall through to history fallback
  }

  // 3. Fall back to the most recent entry in the manually-maintained history JSON
  const fallback = fallbackFromHistory()
  if (fallback) {
    return NextResponse.json({ ...fallback, source: 'fallback' })
  }

  return NextResponse.json(
    { error: 'Fuel surcharge rate unavailable.' },
    { status: 503 }
  )
}
