'use server'

import { redirect } from 'next/navigation'

import { resolveFedExFuelSurchargeRates } from '@/lib/cache/fedex-fuel-surcharge-cache'
import { resolveFuelSurchargeRates } from '@/lib/cache/ups-fuel-surcharge-cache'
import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { estimateFedEx } from '@/lib/pricing/fedex-estimate'
import type { FedExRateBreakdown, FedExService } from '@/lib/pricing/fedex-types'
import { loadFedExZoneChart } from '@/lib/pricing/fedex-zone-chart-loader'
import { RATES_VERSION } from '@/lib/pricing/rates-version'
import type { UPSRateBreakdown, UPSService } from '@/lib/pricing/types'
import { estimateUPS } from '@/lib/pricing/ups-estimate'
import { loadZoneChart } from '@/lib/pricing/zone-chart-loader'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type CalculatorInput = {
  originZip: string
  destinationZip: string
  weightLbs: number
  residential: boolean
  upsService: UPSService
  fedexService: FedExService
  dimensionsIn?: { length: number; width: number; height: number }
  markupPct: number
  nonStandard: boolean
  addressCorrection: boolean
  sandbox: boolean
}

export type UPSOutcome =
  | { ok: true; breakdown: UPSRateBreakdown; ratesVersion: string }
  | { ok: false; error: string }

export type FedExOutcome =
  | { ok: true; breakdown: FedExRateBreakdown; ratesVersion: string }
  | { ok: false; error: string }

export type CalculateRatesResult = {
  ups: UPSOutcome
  fedex: FedExOutcome
  hasContractDiscounts: boolean
  requestId?: string
}

export async function calculateRates(input: CalculatorInput): Promise<CalculateRatesResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  // Session-scoped supabase client has RLS — user can read their own discount row
  const contractDiscounts = await loadUserContractDiscounts(supabase, user)
  const hasContractDiscounts = Object.keys(contractDiscounts).length > 0

  const commonParams = {
    weightLbs: input.weightLbs,
    dimensionsIn: input.dimensionsIn,
    residential: input.residential,
    nonStandardPackaging: input.nonStandard,
    addressCorrection: input.addressCorrection,
    contractDiscounts,
  }

  // Zone charts (sync) + fuel surcharges (async) in parallel
  const upsZoneChart = loadZoneChart(input.originZip)
  const fedexZoneChart = loadFedExZoneChart(input.originZip)

  const [upsFuel, fedexFuel] = await Promise.all([
    resolveFuelSurchargeRates({ warmCache: false }),
    resolveFedExFuelSurchargeRates({ warmCache: false }),
  ])

  const upsRaw = upsZoneChart
    ? estimateUPS({
        ...commonParams,
        destinationZip: input.destinationZip,
        service: input.upsService,
        rateType: 'daily',
        zoneChart: upsZoneChart,
        fuelSurchargeRates: upsFuel
          ? { ground: upsFuel.ground, air: upsFuel.air }
          : undefined,
      })
    : ({ ok: false, error: 'UPS zone chart unavailable for this origin ZIP.' } as const)

  const fedexRaw = fedexZoneChart
    ? estimateFedEx({
        ...commonParams,
        destinationZip: input.destinationZip,
        service: input.fedexService,
        zoneChart: fedexZoneChart,
        fuelSurchargeRates: fedexFuel
          ? { ground: fedexFuel.ground, express: fedexFuel.express }
          : undefined,
      })
    : ({ ok: false, error: 'FedEx zone chart unavailable for this origin ZIP.' } as const)

  const ups: UPSOutcome = upsRaw.ok
    ? { ok: true, breakdown: upsRaw.breakdown, ratesVersion: RATES_VERSION.ups.effectiveDate }
    : { ok: false, error: upsRaw.error }

  const fedex: FedExOutcome = fedexRaw.ok
    ? { ok: true, breakdown: fedexRaw.breakdown, ratesVersion: RATES_VERSION.fedex.effectiveDate }
    : { ok: false, error: fedexRaw.error }

  let requestId: string | undefined

  // Log to rate_requests unless sandbox mode or no API key linked
  if (!input.sandbox && ctx.apiKeyId) {
    try {
      const admin = createAdminClient()
      const { data: reqRow } = await admin
        .from('rate_requests')
        .insert({
          customer_id: ctx.customer_id,
          api_key_id: ctx.apiKeyId,
          origin_zip: input.originZip,
          destination_zip: input.destinationZip,
          residential: input.residential,
          weight_lbs: input.weightLbs,
          carrier: 'ups+fedex',
          service_type: `ups:${input.upsService}|fedex:${input.fedexService}`,
          non_standard: input.nonStandard,
          address_correction: input.addressCorrection,
          markup_pct: input.markupPct,
          status: ups.ok || fedex.ok ? 'completed' : 'error',
          breakdown: {
            ups: ups.ok ? ups.breakdown : { error: ups.error },
            fedex: fedex.ok ? fedex.breakdown : { error: fedex.error },
          },
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      requestId = reqRow?.id as string | undefined
    } catch {
      // Logging failure must not break the response
    }
  }

  return { ups, fedex, hasContractDiscounts, requestId }
}
