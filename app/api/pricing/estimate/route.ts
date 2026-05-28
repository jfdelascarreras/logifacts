import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/cache/redis'
import { estimateUPS } from '@/lib/pricing/ups-estimate'
import { loadZoneChart, resolveZoneChartPrefix } from '@/lib/pricing/zone-chart-loader'
import type { ContractDiscounts, UPSRateType, UPSService } from '@/lib/pricing/types'
import type { LiveFuelRates } from '@/lib/pricing/ups-fuel-surcharge'

const FUEL_REDIS_KEY = 'ups:fuel-surcharge'

const VALID_SERVICES: UPSService[] = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const VALID_RATE_TYPES: UPSRateType[] = ['daily', 'smallBusiness']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    weightLbs,
    dimensionsIn,
    originZip: bodyOriginZip,
    destinationZip,
    service,
    rateType: rawRateType,
    residential,
    nonStandardPackaging,
    declaredValueDollars,
    addressCorrection,
    contractDiscounts: rawDiscounts,
  } = body as Record<string, unknown>

  if (typeof weightLbs !== 'number' || weightLbs <= 0) {
    return NextResponse.json({ error: 'Invalid weight.' }, { status: 422 })
  }
  if (typeof destinationZip !== 'string' || !/^\d{5}$/.test(destinationZip)) {
    return NextResponse.json({ error: 'Destination ZIP must be exactly 5 digits.' }, { status: 422 })
  }
  if (typeof service !== 'string' || !VALID_SERVICES.includes(service as UPSService)) {
    return NextResponse.json({ error: 'Invalid service.' }, { status: 422 })
  }
  const rateType: UPSRateType = (typeof rawRateType === 'string' && VALID_RATE_TYPES.includes(rawRateType as UPSRateType))
    ? rawRateType as UPSRateType
    : 'daily'

  let parsedDims: { length: number; width: number; height: number } | undefined
  if (dimensionsIn != null) {
    const d = dimensionsIn as Record<string, unknown>
    if (
      typeof d.length !== 'number' || d.length <= 0 ||
      typeof d.width !== 'number' || d.width <= 0 ||
      typeof d.height !== 'number' || d.height <= 0
    ) {
      return NextResponse.json({ error: 'Invalid dimensions — all values must be positive numbers.' }, { status: 422 })
    }
    parsedDims = { length: d.length, width: d.width, height: d.height }
  }

  // Origin ZIP: body overrides profile (allows per-query override)
  const profileOriginZip = String(user.user_metadata?.origin_zip ?? '')
  const originZip = (typeof bodyOriginZip === 'string' && /^\d{5}$/.test(bodyOriginZip))
    ? bodyOriginZip
    : profileOriginZip

  if (!/^\d{5}$/.test(originZip)) {
    return NextResponse.json(
      { error: 'Origin ZIP not set. Please add your shipping origin ZIP in My Profile.' },
      { status: 422 }
    )
  }

  const zoneChart = loadZoneChart(originZip)
  if (!zoneChart) {
    const prefix = resolveZoneChartPrefix(originZip)
    return NextResponse.json(
      {
        error: prefix
          ? `Zone chart unavailable for origin prefix ${prefix}.`
          : 'Zone chart unavailable for this origin ZIP.',
      },
      { status: 422 }
    )
  }

  // Profile discounts are the default; body discounts override per-field
  const profileDiscounts = (user.user_metadata?.contract_discounts as ContractDiscounts | undefined) ?? {}
  const bodyDiscounts = (rawDiscounts !== null && typeof rawDiscounts === 'object')
    ? rawDiscounts as ContractDiscounts
    : {}
  const contractDiscounts: ContractDiscounts = { ...profileDiscounts, ...bodyDiscounts }

  // Read cached live fuel surcharge rates from Redis (falls back to history JSON in estimateUPS)
  let fuelSurchargeRates: LiveFuelRates | undefined
  try {
    fuelSurchargeRates = (await redis?.get<LiveFuelRates>(FUEL_REDIS_KEY)) ?? undefined
  } catch {
    // Redis unavailable — estimateUPS will use the history JSON fallback
  }

  const result = estimateUPS({
    weightLbs,
    dimensionsIn: parsedDims,
    destinationZip,
    service: service as UPSService,
    rateType,
    residential: Boolean(residential),
    nonStandardPackaging: Boolean(nonStandardPackaging),
    declaredValueDollars: typeof declaredValueDollars === 'number' ? declaredValueDollars : 0,
    addressCorrection: Boolean(addressCorrection),
    zoneChart,
    contractDiscounts,
    fuelSurchargeRates,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({ breakdown: result.breakdown })
}
