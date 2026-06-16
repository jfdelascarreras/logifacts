import { NextResponse } from 'next/server'

import { resolveFuelSurchargeRates } from '@/lib/cache/ups-fuel-surcharge-cache'
import { resolveFedExFuelSurchargeRates } from '@/lib/cache/fedex-fuel-surcharge-cache'
import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'
import { loadFedExFuelSurchargeHistory } from '@/lib/pricing/fedex-fuel-surcharge-history'
import { fetchEiaDieselHistory } from '@/lib/fuel-surcharges/eia'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [upsLive, fedexLive, upsHistory, fedexHistory, eiaResult] = await Promise.all([
    resolveFuelSurchargeRates({ warmCache: true }),
    resolveFedExFuelSurchargeRates({ warmCache: true }),
    Promise.resolve(loadFuelSurchargeHistory()),
    Promise.resolve(loadFedExFuelSurchargeHistory()),
    fetchEiaDieselHistory(),
  ])

  const eia = eiaResult.ok ? eiaResult.data : []
  const eiaError = eiaResult.ok ? null : eiaResult.error

  const weekOverWeekDelta =
    upsHistory.length >= 2
      ? {
          ground: +(upsHistory[0]!.domesticGround - upsHistory[1]!.domesticGround).toFixed(4),
          air: +(upsHistory[0]!.domesticAir - upsHistory[1]!.domesticAir).toFixed(4),
        }
      : null

  const fedexWoWDelta =
    fedexHistory.length >= 2
      ? {
          ground: +(fedexHistory[0]!.ground - fedexHistory[1]!.ground).toFixed(4),
          express: +(fedexHistory[0]!.express - fedexHistory[1]!.express).toFixed(4),
        }
      : null

  const fiftyTwoWeekGroundHigh = upsHistory.length > 0
    ? Math.max(...upsHistory.map((r) => r.domesticGround))
    : null
  const fiftyTwoWeekGroundLow = upsHistory.length > 0
    ? Math.min(...upsHistory.map((r) => r.domesticGround))
    : null

  return NextResponse.json({
    current: upsLive,
    fedexCurrent: fedexLive,
    ups: upsHistory,
    fedex: fedexHistory,
    eia,
    eiaError,
    weekOverWeekDelta,
    fedexWoWDelta,
    fiftyTwoWeekGroundHigh,
    fiftyTwoWeekGroundLow,
  })
}
