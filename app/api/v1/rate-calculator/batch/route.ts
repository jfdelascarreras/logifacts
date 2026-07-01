import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

import { calcFedEx, calcUPS, type CalcParams, type Dimensions } from '@/lib/rate-calculator/calc'
import { mockCalcFedEx, mockCalcUPS } from '@/lib/rate-calculator/mock-calc'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashApiKey } from '@/lib/api/base-url'
import { apiError, Err } from '@/lib/api/errors'
import { getCachedIdempotentResponse, cacheIdempotentResponse } from '@/lib/api/idempotency'
import type { FedExService, UPSService } from '@/lib/pricing'

const BATCH_MAX = 100

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

const VALID_UPS: UPSService[]   = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const VALID_FEDEX: FedExService[] = [
  'ground', 'home_delivery', 'express_saver', '2day', 'standard_overnight', 'priority_overnight',
]

type ShipmentInput = Record<string, unknown>

type ShipmentResult =
  | { index: number; ups: unknown; fedex: unknown }
  | { index: number; error: { code: string; message: string } }

function validateShipment(s: ShipmentInput): string | null {
  if (typeof s.origin_zip !== 'string' || !/^\d{5}$/.test(s.origin_zip))
    return 'origin_zip must be a 5-digit ZIP code.'
  if (typeof s.destination_zip !== 'string' || !/^\d{5}$/.test(s.destination_zip))
    return 'destination_zip must be a 5-digit ZIP code.'
  if (typeof s.weight_lbs !== 'number' || s.weight_lbs <= 0)
    return 'weight_lbs must be a positive number.'
  if (!s.dimensions_in || typeof s.dimensions_in !== 'object')
    return 'dimensions_in is required: { length, width, height } in inches.'
  const d = s.dimensions_in as Record<string, unknown>
  if (
    typeof d.length !== 'number' || typeof d.width !== 'number' || typeof d.height !== 'number' ||
    d.length <= 0 || d.width <= 0 || d.height <= 0
  ) return 'dimensions_in must have positive numeric length, width, and height (in inches).'
  if (typeof s.markup_pct === 'number' && (s.markup_pct < 0 || s.markup_pct > 500))
    return 'markup_pct must be between 0 and 500.'
  return null
}

export async function POST(req: Request) {
  try {
    return await handler(req)
  } catch (err) {
    console.error('[rate-calculator/batch] unhandled error:', err)
    return apiError(Err.internal(err instanceof Error ? err.message : undefined), 500)
  }
}

async function handler(req: Request) {
  const supabase = createAdminClient()

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return apiError(Err.unauthorized(), 401)

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

  // ── Debounced last_used_at ────────────────────────────────────────────────
  const redis = getRedis()
  if (redis) {
    const set = await redis.set(`luat:${keyRow.id}`, '1', { nx: true, ex: 60 }).catch(() => null)
    if (set === 'OK') {
      void supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
    }
  } else {
    void supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
  }

  // ── Rate limit — 1 slot for the entire batch ──────────────────────────────
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

  // ── Idempotency ───────────────────────────────────────────────────────────
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
  if (!body || typeof body !== 'object') return apiError(Err.invalidBody(), 400)

  const { shipments } = body as Record<string, unknown>

  if (!Array.isArray(shipments) || shipments.length === 0)
    return apiError(Err.validation('shipments must be a non-empty array.'), 422)
  if (shipments.length > BATCH_MAX)
    return apiError(Err.validation(`shipments exceeds the maximum of ${BATCH_MAX} per request.`), 422)

  // ── Load contract discounts once for all shipments ────────────────────────
  const contractDiscounts = isSandbox
    ? {}
    : await loadUserContractDiscounts(supabase, { id: userId, user_metadata: {} })

  const hasDiscounts = Object.keys(contractDiscounts).length > 0

  // ── Process all shipments in parallel ─────────────────────────────────────
  const results: ShipmentResult[] = await Promise.all(
    (shipments as ShipmentInput[]).map(async (s, index) => {
      const validationErr = validateShipment(s)
      if (validationErr) {
        return { index, error: Err.validation(validationErr) }
      }

      const d        = s.dimensions_in as Record<string, number>
      const dims: Dimensions = { length: d.length, width: d.width, height: d.height }
      const residential      = Boolean(s.residential)
      const markupPct        = typeof s.markup_pct === 'number' ? s.markup_pct : 0

      const upsService: UPSService =
        typeof s.ups_service === 'string' && VALID_UPS.includes(s.ups_service as UPSService)
          ? (s.ups_service as UPSService) : 'ground'

      const fedexService: FedExService =
        typeof s.fedex_service === 'string' && VALID_FEDEX.includes(s.fedex_service as FedExService)
          ? (s.fedex_service as FedExService)
          : residential ? 'home_delivery' : 'ground'

      if (isSandbox) {
        return { index, ups: mockCalcUPS(upsService), fedex: mockCalcFedEx(fedexService) }
      }

      const params: CalcParams = {
        weightLbs:        s.weight_lbs as number,
        dimensionsIn:     dims,
        originZip:        s.origin_zip as string,
        destZip:          s.destination_zip as string,
        residential,
        nonStandard:      Boolean(s.non_standard),
        addressCorrection: Boolean(s.address_correction),
        contractDiscounts,
        markupPct,
      }

      const [ups, fedex] = await Promise.all([
        calcUPS({ ...params, service: upsService }).catch((e: unknown) => ({
          error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'UPS calculation failed.' },
        })),
        calcFedEx({ ...params, service: fedexService }).catch((e: unknown) => ({
          error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'FedEx calculation failed.' },
        })),
      ])

      return { index, ups, fedex }
    })
  )

  const warnings: string[] = []
  if (!isSandbox && !hasDiscounts) {
    warnings.push('No contract discounts configured for this customer — rates reflect published carrier prices.')
  }

  const responseBody = {
    results,
    ...(warnings.length > 0 && { warnings }),
    ...(isSandbox && { _sandbox: true }),
  }

  if (idempotencyKey && redis) {
    await cacheIdempotentResponse(redis, keyRow.customer_id, idempotencyKey, responseBody)
  }

  return NextResponse.json(responseBody, { headers: rlHeaders })
}
