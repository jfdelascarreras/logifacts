import { NextResponse } from 'next/server'

import { resolveFedExFuelSurchargeRates } from '@/lib/cache/fedex-fuel-surcharge-cache'

/**
 * Internal endpoint called by GitHub Actions weekly to get current FedEx fuel
 * surcharge rates so the fallback JSON can be committed to the repo.
 *
 * Protected by INTERNAL_API_SECRET — never expose to users.
 */
export async function GET(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rates = await resolveFedExFuelSurchargeRates({ warmCache: true })
  if (!rates) {
    return NextResponse.json({ error: 'Could not resolve FedEx fuel surcharge rates' }, { status: 503 })
  }

  if (rates.source === 'fallback') {
    return NextResponse.json(
      {
        error: 'Live FedEx fuel scrape unavailable — only history JSON fallback resolved.',
        source: rates.source,
        ground: rates.ground,
        express: rates.express,
      },
      { status: 503 },
    )
  }

  return NextResponse.json(rates)
}
