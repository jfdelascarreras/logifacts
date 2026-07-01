import { Client as QStashClient } from '@upstash/qstash'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

import { calcFedEx, calcUPS, type CalcParams, type Dimensions } from '@/lib/rate-calculator/calc'
import { mockCalcFedEx, mockCalcUPS } from '@/lib/rate-calculator/mock-calc'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createAdminClient } from '@/lib/supabase/admin'
import { baseUrl, hashApiKey } from '@/lib/api/base-url'
import { apiError, Err } from '@/lib/api/errors'
import { getCachedIdempotentResponse, cacheIdempotentResponse } from '@/lib/api/idempotency'
import type { FedExService, UPSService } from '@/lib/pricing'

let _ratelimit: Ratelimit | null = null
let _redis: Redis | null = null

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

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

const VALID_UPS_SERVICES: UPSService[] = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const VALID_FEDEX_SERVICES: FedExService[] = [
  'ground', 'home_delivery', 'express_saver', '2day', 'standard_overnight', 'priority_overnight',
]

export async function POST(req: Request) {
  try {
    return await handler(req)
  } catch (err) {
    console.error('[rate-calculator] unhandled error:', err)
    return apiError(Err.internal(err instanceof Error ? err.message : undefined), 500)
  }
}

async function handler(req: Request) {
  const supabase = createAdminClient()

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return apiError(Err.unauthorized(), 401)
  }

  const rawKey = authHeader.slice(7).trim()
  const keyHash = await hashApiKey(rawKey)

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, customer_id, key_type, customers!inner(user_id)')
    .eq('key_hash', keyHash)
    .eq('active', true)
    .maybeSingle()

  if (!keyRow) return apiError(Err.invalidKey(), 401)

  const isSandbox = keyRow.key_type === 'test'
  const userId = (keyRow.customers as unknown as { user_id: string }).user_id

  // ── Debounced last_used_at ───────────────────────────────────────────────
  const redis = getRedis()
  if (redis) {
    const set = await redis.set(`luat:${keyRow.id}`, '1', { nx: true, ex: 60 }).catch(() => null)
    if (set === 'OK') {
      void supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
    }
  } else {
    void supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  let rlRemaining: number | null = null
  let rlReset: number | null = null
  const rl = getRatelimit()
  if (rl) {
    try {
      const { success, remaining, reset } = await rl.limit(keyRow.id)
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000)
        return apiError(Err.rateLimited(), 429, {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': retryAfter.toString(),
        })
      }
      rlRemaining = remaining
      rlReset = reset
    } catch { /* fail open */ }
  }

  const rlHeaders: Record<string, string> = {}
  if (rlRemaining !== null) rlHeaders['X-RateLimit-Remaining'] = rlRemaining.toString()
  if (rlReset !== null)     rlHeaders['X-RateLimit-Reset']     = rlReset.toString()

  // ── Idempotency ──────────────────────────────────────────────────────────
  const idempotencyKey = req.headers.get('idempotency-key')
  if (idempotencyKey && redis) {
    const cached = await getCachedIdempotentResponse(redis, keyRow.customer_id, idempotencyKey)
    if (cached) {
      return new NextResponse(cached, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Idempotent-Replay': 'true', ...rlHeaders },
      })
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return apiError(Err.invalidBody(), 400)
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

  // ── Validate ─────────────────────────────────────────────────────────────
  if (typeof rawOriginZip !== 'string' || !/^\d{5}$/.test(rawOriginZip))
    return apiError(Err.validation('origin_zip must be a 5-digit ZIP code.'), 422)
  if (typeof rawDestZip !== 'string' || !/^\d{5}$/.test(rawDestZip))
    return apiError(Err.validation('destination_zip must be a 5-digit ZIP code.'), 422)
  if (typeof rawWeight !== 'number' || rawWeight <= 0)
    return apiError(Err.validation('weight_lbs must be a positive number.'), 422)

  if (!rawDimensions || typeof rawDimensions !== 'object')
    return apiError(Err.validation('dimensions_in is required: { length, width, height } in inches.'), 422)

  const d = rawDimensions as Record<string, unknown>
  const l = typeof d.length === 'number' ? d.length : NaN
  const w = typeof d.width  === 'number' ? d.width  : NaN
  const h = typeof d.height === 'number' ? d.height : NaN
  if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0)
    return apiError(Err.validation('dimensions_in must have positive numeric length, width, and height (in inches).'), 422)

  const dimensionsIn: Dimensions = { length: l, width: w, height: h }

  if (typeof rawMarkup === 'number' && (rawMarkup < 0 || rawMarkup > 500))
    return apiError(Err.validation('markup_pct must be between 0 and 500.'), 422)

  let callbackUrl: string | null = null
  if (rawCallbackUrl !== undefined && rawCallbackUrl !== null) {
    if (typeof rawCallbackUrl !== 'string')
      return apiError(Err.callbackUrl('callback_url must be a string.'), 422)
    try {
      const parsed = new URL(rawCallbackUrl)
      if (parsed.protocol !== 'https:')
        return apiError(Err.callbackUrl('callback_url must use HTTPS.'), 422)
      callbackUrl = rawCallbackUrl
    } catch {
      return apiError(Err.callbackUrl('callback_url is not a valid URL.'), 422)
    }
  }

  const isResidential      = Boolean(rawResidential)
  const isNonStandard      = Boolean(rawNonStandard)
  const isAddressCorrection = Boolean(rawAddressCorrection)
  const markupPct          = typeof rawMarkup === 'number' ? rawMarkup : 0

  const upsService: UPSService =
    typeof rawUpsService === 'string' && VALID_UPS_SERVICES.includes(rawUpsService as UPSService)
      ? (rawUpsService as UPSService) : 'ground'

  const fedexService: FedExService =
    typeof rawFedexService === 'string' && VALID_FEDEX_SERVICES.includes(rawFedexService as FedExService)
      ? (rawFedexService as FedExService)
      : isResidential ? 'home_delivery' : 'ground'

  // ── Async path ────────────────────────────────────────────────────────────
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

    if (insertErr || !reqRow)
      return apiError(Err.internal('Failed to store rate request.'), 500)

    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL })
    try {
      await qstash.publishJSON({
        url: `${baseUrl()}/api/v1/jobs/rate-calculate`,
        body: {
          request_id: reqRow.id,
          customer_id: keyRow.customer_id,
          user_id: userId,
          key_hash: keyHash,
          is_sandbox: isSandbox,
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
      await supabase.from('rate_requests').update({ status: 'error' }).eq('id', reqRow.id)
      return apiError(Err.unavailable('Failed to queue rate calculation. Please retry.'), 503)
    }

    const responseBody = { request_id: reqRow.id, status: 'pending' }
    if (idempotencyKey && redis) {
      await cacheIdempotentResponse(redis, keyRow.customer_id, idempotencyKey, responseBody)
    }
    return NextResponse.json(responseBody, { headers: rlHeaders })
  }

  // ── Synchronous path ──────────────────────────────────────────────────────
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

  if (insertErr || !reqRow)
    return apiError(Err.internal('Failed to store rate request.'), 500)

  const requestId = reqRow.id

  let upsResult: unknown
  let fedexResult: unknown
  const warnings: string[] = []

  if (isSandbox) {
    upsResult   = mockCalcUPS(upsService)
    fedexResult = mockCalcFedEx(fedexService)
  } else {
    const contractDiscounts = await loadUserContractDiscounts(supabase, { id: userId, user_metadata: {} })

    if (Object.keys(contractDiscounts).length === 0) {
      warnings.push('No contract discounts configured for this customer — rates reflect published carrier prices.')
    }

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

    ;[upsResult, fedexResult] = await Promise.all([
      calcUPS({ ...commonParams, service: upsService }).catch((e: unknown) => ({
        error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'UPS calculation failed.' },
      })),
      calcFedEx({ ...commonParams, service: fedexService }).catch((e: unknown) => ({
        error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'FedEx calculation failed.' },
      })),
    ])
  }

  const anySuccess =
    !(upsResult   && typeof upsResult   === 'object' && 'error' in upsResult) ||
    !(fedexResult && typeof fedexResult === 'object' && 'error' in fedexResult)

  await supabase
    .from('rate_requests')
    .update({
      status: anySuccess ? 'completed' : 'error',
      breakdown: { ups: upsResult, fedex: fedexResult } as object,
      completed_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  const responseBody = {
    request_id: requestId,
    ...(warnings.length > 0 && { warnings }),
    ups: upsResult,
    fedex: fedexResult,
    ...(isSandbox && { _sandbox: true }),
  }

  if (idempotencyKey && redis) {
    await cacheIdempotentResponse(redis, keyRow.customer_id, idempotencyKey, responseBody)
  }

  return NextResponse.json(responseBody, { headers: rlHeaders })
}
