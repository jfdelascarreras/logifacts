import { Client as QStashClient } from '@upstash/qstash'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

import { calcFedEx, calcUPS, type CalcParams, type Dimensions } from '@/lib/rate-calculator/calc'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createAdminClient } from '@/lib/supabase/admin'
import { baseUrl, hashApiKey } from '@/lib/api/base-url'
import type { FedExService, UPSService } from '@/lib/pricing'

// Lazy-init: Redis.fromEnv() throws at import time if env vars are absent.
// Initialize on first use so missing Redis only degrades rate-limiting (fail-open),
// rather than crashing the entire module and returning 500 for every request.
let _ratelimit: Ratelimit | null = null
function getRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      prefix: 'rl:rate-calculator',
    })
  }
  return _ratelimit
}

const VALID_UPS_SERVICES: UPSService[] = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const VALID_FEDEX_SERVICES: FedExService[] = [
  'ground',
  'home_delivery',
  'express_saver',
  '2day',
  'standard_overnight',
  'priority_overnight',
]

async function hashKey(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(req: Request) {
  try {
    return await handler(req)
  } catch (err) {
    console.error('[rate-calculator] unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}

async function handler(req: Request) {
  const supabase = createAdminClient()

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header.' },
      { status: 401 },
    )
  }

  const rawKey = authHeader.slice(7).trim()
  const keyHash = await hashApiKey(rawKey)

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, customer_id')
    .eq('key_hash', keyHash)
    .eq('active', true)
    .maybeSingle()

  if (!keyRow) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('user_id')
    .eq('customer_id', keyRow.customer_id)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ error: 'Customer record not found.' }, { status: 401 })
  }

  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)

  // ── Rate limit ───────────────────────────────────────────────────────────────
  let rlRemaining: number | null = null
  let rlReset: number | null = null
  const rl = getRatelimit()
  if (rl) {
    try {
      const { success, remaining, reset } = await rl.limit(keyRow.id)
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Max 100 requests per minute per API key.' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': reset.toString(),
            },
          },
        )
      }
      rlRemaining = remaining
      rlReset = reset
    } catch {
      // Redis unavailable — fail open
    }
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    origin_zip: rawOriginZip,
    destination_zip: rawDestZip,
    residential: rawResidential,
    weight_lbs: rawWeight,
    dimensions_in: rawDimensions,
    ups_service: rawUpsService,
    fedex_service: rawFedexService,
    non_standard: rawNonStandard,
    address_correction: rawAddressCorrection,
    markup_pct: rawMarkup,
    callback_url: rawCallbackUrl,
  } = body as Record<string, unknown>

  // ── Validate ─────────────────────────────────────────────────────────────────
  if (typeof rawOriginZip !== 'string' || !/^\d{5}$/.test(rawOriginZip)) {
    return NextResponse.json({ error: 'origin_zip must be a 5-digit ZIP code.' }, { status: 422 })
  }
  if (typeof rawDestZip !== 'string' || !/^\d{5}$/.test(rawDestZip)) {
    return NextResponse.json({ error: 'destination_zip must be a 5-digit ZIP code.' }, { status: 422 })
  }
  if (typeof rawWeight !== 'number' || rawWeight <= 0) {
    return NextResponse.json({ error: 'weight_lbs must be a positive number.' }, { status: 422 })
  }

  if (!rawDimensions || typeof rawDimensions !== 'object') {
    return NextResponse.json(
      { error: 'dimensions_in is required: { length, width, height } in inches.' },
      { status: 422 },
    )
  }
  const d = rawDimensions as Record<string, unknown>
  const l = typeof d.length === 'number' ? d.length : NaN
  const w = typeof d.width === 'number' ? d.width : NaN
  const h = typeof d.height === 'number' ? d.height : NaN
  if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
    return NextResponse.json(
      { error: 'dimensions_in must have positive numeric length, width, and height (in inches).' },
      { status: 422 },
    )
  }
  const dimensionsIn: Dimensions = { length: l, width: w, height: h }

  if (typeof rawMarkup === 'number' && (rawMarkup < 0 || rawMarkup > 500)) {
    return NextResponse.json({ error: 'markup_pct must be between 0 and 500.' }, { status: 422 })
  }

  // callback_url — if present must be a valid HTTPS URL
  let callbackUrl: string | null = null
  if (rawCallbackUrl !== undefined && rawCallbackUrl !== null) {
    if (typeof rawCallbackUrl !== 'string') {
      return NextResponse.json({ error: 'callback_url must be a string.' }, { status: 422 })
    }
    try {
      const parsed = new URL(rawCallbackUrl)
      if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'callback_url must use HTTPS.' }, { status: 422 })
      }
      callbackUrl = rawCallbackUrl
    } catch {
      return NextResponse.json({ error: 'callback_url is not a valid URL.' }, { status: 422 })
    }
  }

  const isResidential = Boolean(rawResidential)
  const isNonStandard = Boolean(rawNonStandard)
  const isAddressCorrection = Boolean(rawAddressCorrection)
  const markupPct = typeof rawMarkup === 'number' ? rawMarkup : 0

  const upsService: UPSService =
    typeof rawUpsService === 'string' && VALID_UPS_SERVICES.includes(rawUpsService as UPSService)
      ? (rawUpsService as UPSService)
      : 'ground'

  const fedexService: FedExService =
    typeof rawFedexService === 'string' && VALID_FEDEX_SERVICES.includes(rawFedexService as FedExService)
      ? (rawFedexService as FedExService)
      : isResidential
        ? 'home_delivery'
        : 'ground'

  const rlHeaders: Record<string, string> = {}
  if (rlRemaining !== null) rlHeaders['X-RateLimit-Remaining'] = rlRemaining.toString()
  if (rlReset !== null) rlHeaders['X-RateLimit-Reset'] = rlReset.toString()

  // ── Async path ───────────────────────────────────────────────────────────────
  if (callbackUrl) {
    const { data: reqRow, error: insertErr } = await supabase
      .from('rate_requests')
      .insert({
        customer_id: keyRow.customer_id,
        api_key_id: keyRow.id,
        origin_zip: rawOriginZip,
        destination_zip: rawDestZip,
        residential: isResidential,
        weight_lbs: rawWeight,
        carrier: 'ups+fedex',
        service_type: `ups:${upsService}|fedex:${fedexService}`,
        non_standard: isNonStandard,
        address_correction: isAddressCorrection,
        markup_pct: markupPct,
        status: 'pending',
        callback_url: callbackUrl,
      })
      .select('id')
      .single()

    if (insertErr || !reqRow) {
      return NextResponse.json({ error: 'Failed to store rate request.' }, { status: 500 })
    }

    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL })
    try {
      await qstash.publishJSON({
        url: `${baseUrl()}/api/v1/jobs/rate-calculate`,
        body: {
          request_id: reqRow.id,
          customer_id: keyRow.customer_id,
          user_id: customer.user_id,
          key_hash: keyHash,
          weight_lbs: rawWeight,
          dimensions_in: dimensionsIn,
          origin_zip: rawOriginZip,
          destination_zip: rawDestZip,
          residential: isResidential,
          non_standard: isNonStandard,
          address_correction: isAddressCorrection,
          markup_pct: markupPct,
          ups_service: upsService,
          fedex_service: fedexService,
          callback_url: callbackUrl,
        },
        retries: 2,
      })
    } catch (err) {
      console.error('[rate-calculator] QStash publish failed:', err)
      // Roll back the pending row so it doesn't orphan.
      await supabase.from('rate_requests').update({ status: 'error' }).eq('id', reqRow.id)
      return NextResponse.json(
        { error: 'Failed to queue rate calculation. Please retry.' },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { request_id: reqRow.id, status: 'pending' },
      { headers: rlHeaders },
    )
  }

  // ── Synchronous path (unchanged) ─────────────────────────────────────────────
  const { data: reqRow, error: insertErr } = await supabase
    .from('rate_requests')
    .insert({
      customer_id: keyRow.customer_id,
      api_key_id: keyRow.id,
      origin_zip: rawOriginZip,
      destination_zip: rawDestZip,
      residential: isResidential,
      weight_lbs: rawWeight,
      carrier: 'ups+fedex',
      service_type: `ups:${upsService}|fedex:${fedexService}`,
      non_standard: isNonStandard,
      address_correction: isAddressCorrection,
      markup_pct: markupPct,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !reqRow) {
    return NextResponse.json({ error: 'Failed to store rate request.' }, { status: 500 })
  }

  const requestId: string = reqRow.id

  const contractDiscounts = await loadUserContractDiscounts(supabase, {
    id: customer.user_id,
    user_metadata: {},
  })

  const commonParams: CalcParams = {
    weightLbs: rawWeight,
    dimensionsIn,
    originZip: rawOriginZip,
    destZip: rawDestZip,
    residential: isResidential,
    nonStandard: isNonStandard,
    addressCorrection: isAddressCorrection,
    contractDiscounts,
    markupPct,
  }

  const [upsResult, fedexResult] = await Promise.all([
    calcUPS({ ...commonParams, service: upsService }).catch((e: unknown) => ({
      error: e instanceof Error ? e.message : 'UPS calculation failed.',
    })),
    calcFedEx({ ...commonParams, service: fedexService }).catch((e: unknown) => ({
      error: e instanceof Error ? e.message : 'FedEx calculation failed.',
    })),
  ])

  const anySuccess = !('error' in upsResult) || !('error' in fedexResult)

  const warnings: string[] = []
  if (Object.keys(contractDiscounts).length === 0) {
    warnings.push('No contract discounts configured for this customer — rates reflect published carrier prices.')
  }

  await supabase
    .from('rate_requests')
    .update({
      status: anySuccess ? 'completed' : 'error',
      breakdown: { ups: upsResult, fedex: fedexResult } as object,
      completed_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  return NextResponse.json(
    {
      request_id: requestId,
      ...(warnings.length > 0 && { warnings }),
      ups: upsResult,
      fedex: fedexResult,
    },
    { headers: rlHeaders },
  )
}
