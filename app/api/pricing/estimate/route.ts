import { NextResponse } from 'next/server'

import { resolveFedExFuelSurchargeRates } from '@/lib/cache/fedex-fuel-surcharge-cache'
import { resolveFuelSurchargeRates } from '@/lib/cache/ups-fuel-surcharge-cache'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createClient } from '@/lib/supabase/server'
import { estimateFedEx } from '@/lib/pricing/fedex-estimate'
import { loadFedExZoneChart, resolveFedExZoneChartPrefix } from '@/lib/pricing/fedex-zone-chart-loader'
import type { FedExService, PricingCarrier } from '@/lib/pricing/fedex-types'
import { estimateUPS } from '@/lib/pricing/ups-estimate'
import { loadZoneChart, resolveZoneChartPrefix } from '@/lib/pricing/zone-chart-loader'
import type { ContractDiscounts, UPSRateType, UPSService } from '@/lib/pricing/types'

const VALID_CARRIERS: PricingCarrier[] = ['ups', 'fedex']
const VALID_UPS_SERVICES: UPSService[] = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const VALID_FEDEX_SERVICES: FedExService[] = [
  'ground',
  'home_delivery',
  'express_saver',
  '2day',
  'standard_overnight',
  'priority_overnight',
]
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
    carrier: rawCarrier,
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

  const carrier: PricingCarrier = (typeof rawCarrier === 'string' && VALID_CARRIERS.includes(rawCarrier as PricingCarrier))
    ? rawCarrier as PricingCarrier
    : 'ups'

  if (typeof weightLbs !== 'number' || weightLbs <= 0) {
    return NextResponse.json({ error: 'Invalid weight.' }, { status: 422 })
  }
  if (typeof destinationZip !== 'string' || !/^\d{5}$/.test(destinationZip)) {
    return NextResponse.json({ error: 'Destination ZIP must be exactly 5 digits.' }, { status: 422 })
  }

  if (carrier === 'ups') {
    if (typeof service !== 'string' || !VALID_UPS_SERVICES.includes(service as UPSService)) {
      return NextResponse.json({ error: 'Invalid UPS service.' }, { status: 422 })
    }
  } else if (typeof service !== 'string' || !VALID_FEDEX_SERVICES.includes(service as FedExService)) {
    return NextResponse.json({ error: 'Invalid FedEx service.' }, { status: 422 })
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

  const profileOriginZip = String(user.user_metadata?.origin_zip ?? '')
  const originZip = (typeof bodyOriginZip === 'string' && /^\d{5}$/.test(bodyOriginZip))
    ? bodyOriginZip
    : profileOriginZip

  if (!/^\d{5}$/.test(originZip)) {
    return NextResponse.json(
      { error: 'Origin ZIP not set. Please add your shipping origin ZIP in My Profile.' },
      { status: 422 },
    )
  }

  const profileDiscounts = await loadUserContractDiscounts(supabase, user)
  const bodyDiscounts = (rawDiscounts !== null && typeof rawDiscounts === 'object')
    ? rawDiscounts as ContractDiscounts
    : {}
  const contractDiscounts: ContractDiscounts = { ...profileDiscounts, ...bodyDiscounts }

  if (carrier === 'fedex') {
    const zoneChart = loadFedExZoneChart(originZip)
    if (!zoneChart) {
      const prefix = resolveFedExZoneChartPrefix(originZip)
      return NextResponse.json(
        {
          error: prefix
            ? `FedEx zone chart unavailable for origin prefix ${prefix}.`
            : 'FedEx zone chart unavailable for this origin ZIP.',
        },
        { status: 422 },
      )
    }

    const fuelResolved = await resolveFedExFuelSurchargeRates({ warmCache: false })
    const fuelSurchargeRates = fuelResolved
      ? { ground: fuelResolved.ground, express: fuelResolved.express }
      : undefined

    const result = estimateFedEx({
      weightLbs,
      dimensionsIn: parsedDims,
      destinationZip,
      service: service as FedExService,
      residential: Boolean(residential),
      nonStandardPackaging: Boolean(nonStandardPackaging),
      declaredValueDollars: typeof declaredValueDollars === 'number' && declaredValueDollars > 0
        ? declaredValueDollars
        : 0,
      addressCorrection: Boolean(addressCorrection),
      zoneChart,
      contractDiscounts,
      fuelSurchargeRates,
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    return NextResponse.json({ breakdown: result.breakdown })
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
      { status: 422 },
    )
  }

  let fuelSurchargeRates: { ground: number; air: number } | undefined
  if (rateType !== 'smallBusiness') {
    const fuelResolved = await resolveFuelSurchargeRates({ warmCache: false })
    if (fuelResolved) {
      fuelSurchargeRates = { ground: fuelResolved.ground, air: fuelResolved.air }
    }
  }

  const result = estimateUPS({
    weightLbs,
    dimensionsIn: parsedDims,
    destinationZip,
    service: service as UPSService,
    rateType,
    residential: Boolean(residential),
    nonStandardPackaging: Boolean(nonStandardPackaging),
    declaredValueDollars: typeof declaredValueDollars === 'number' && declaredValueDollars > 0
      ? declaredValueDollars
      : 0,
    addressCorrection: Boolean(addressCorrection),
    zoneChart,
    contractDiscounts,
    fuelSurchargeRates,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({ breakdown: result.breakdown })
}
