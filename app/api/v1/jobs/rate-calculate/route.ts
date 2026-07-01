import { Client as QStashClient, Receiver } from '@upstash/qstash'
import { NextResponse } from 'next/server'

import { calcFedEx, calcUPS, type CalcParams, type Dimensions } from '@/lib/rate-calculator/calc'
import { mockCalcFedEx, mockCalcUPS } from '@/lib/rate-calculator/mock-calc'
import { loadUserContractDiscounts } from '@/lib/profile/contract-discounts'
import { createAdminClient } from '@/lib/supabase/admin'
import { baseUrl } from '@/lib/api/base-url'
import type { FedExService, UPSService } from '@/lib/pricing'

type JobPayload = {
  request_id:        string
  customer_id:       string
  user_id:           string
  key_hash:          string
  is_sandbox?:       boolean
  weight_lbs:        number
  dimensions_in:     Dimensions
  origin_zip:        string
  destination_zip:   string
  residential:       boolean
  non_standard:      boolean
  address_correction: boolean
  markup_pct:        number
  ups_service:       UPSService
  fedex_service:     FedExService
  callback_url:      string
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey:    process.env.QSTASH_NEXT_SIGNING_KEY!,
  })

  const isValid = await receiver.verify({
    signature: req.headers.get('Upstash-Signature') ?? '',
    body: rawBody,
  }).catch(() => false)

  if (!isValid) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid QStash signature.' } }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as JobPayload
  const supabase = createAdminClient()

  // ── Idempotency: skip recalculation if already in a terminal state ────────
  const { data: existing } = await supabase
    .from('rate_requests')
    .select('status, delivered_at')
    .eq('id', payload.request_id)
    .maybeSingle()

  if (existing?.status === 'completed' || existing?.status === 'delivery_failed') {
    if (!existing.delivered_at) {
      await enqueueDelivery(payload.request_id, payload.callback_url, payload.key_hash)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Load contract discounts ───────────────────────────────────────────────
  const contractDiscounts = payload.is_sandbox
    ? {}
    : await loadUserContractDiscounts(supabase, { id: payload.user_id, user_metadata: {} })

  const commonParams: CalcParams = {
    weightLbs:         payload.weight_lbs,
    dimensionsIn:      payload.dimensions_in,
    originZip:         payload.origin_zip,
    destZip:           payload.destination_zip,
    residential:       payload.residential,
    nonStandard:       payload.non_standard,
    addressCorrection: payload.address_correction,
    contractDiscounts,
    markupPct:         payload.markup_pct,
  }

  // ── Run both carriers ─────────────────────────────────────────────────────
  let upsResult: unknown
  let fedexResult: unknown

  if (payload.is_sandbox) {
    upsResult   = mockCalcUPS(payload.ups_service)
    fedexResult = mockCalcFedEx(payload.fedex_service)
  } else {
    ;[upsResult, fedexResult] = await Promise.all([
      calcUPS({ ...commonParams, service: payload.ups_service }).catch((e: unknown) => ({
        error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'UPS calculation failed.' },
      })),
      calcFedEx({ ...commonParams, service: payload.fedex_service }).catch((e: unknown) => ({
        error: { code: 'CALCULATION_ERROR', message: e instanceof Error ? e.message : 'FedEx calculation failed.' },
      })),
    ])
  }

  const anySuccess =
    !(upsResult   && typeof upsResult   === 'object' && 'error' in upsResult) ||
    !(fedexResult && typeof fedexResult === 'object' && 'error' in fedexResult)

  const warnings: string[] = []
  if (!payload.is_sandbox && Object.keys(contractDiscounts).length === 0) {
    warnings.push('No contract discounts configured for this customer — rates reflect published carrier prices.')
  }

  // ── Persist result ────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('rate_requests')
    .update({
      status:       anySuccess ? 'completed' : 'error',
      breakdown:    { ups: upsResult, fedex: fedexResult, warnings } as object,
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.request_id)

  if (updateErr) {
    console.error('[rate-calculate] failed to persist result:', updateErr)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to persist result.' } },
      { status: 500 },
    )
  }

  await enqueueDelivery(payload.request_id, payload.callback_url, payload.key_hash)
  return NextResponse.json({ ok: true })
}

async function enqueueDelivery(requestId: string, callbackUrl: string, keyHash: string) {
  const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL })
  await qstash.publishJSON({
    url:     `${baseUrl()}/api/v1/jobs/webhook-deliver`,
    body:    { request_id: requestId, callback_url: callbackUrl, key_hash: keyHash },
    retries: 2,
  })
}
