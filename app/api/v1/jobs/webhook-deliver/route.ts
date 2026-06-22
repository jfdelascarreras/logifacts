import { Receiver } from '@upstash/qstash'
import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

type DeliveryPayload = {
  request_id: string
  callback_url: string
  key_hash: string
}

async function hmacSign(keyHash: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyHash),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(req: Request) {
  // ── Verify request is from QStash ─────────────────────────────────────────
  const rawBody = await req.text()

  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  })

  const isValid = await receiver.verify({
    signature: req.headers.get('Upstash-Signature') ?? '',
    body: rawBody,
  }).catch(() => false)

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid QStash signature.' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as DeliveryPayload
  const supabase = createAdminClient()

  // ── Idempotency: skip if already delivered ────────────────────────────────
  const { data: row } = await supabase
    .from('rate_requests')
    .select('status, breakdown, delivered_at, delivery_attempts')
    .eq('id', payload.request_id)
    .single()

  if (!row) {
    // Request row missing — nothing to deliver, stop retrying
    return NextResponse.json({ error: 'Request not found.' }, { status: 200 })
  }

  if (row.delivered_at) {
    return NextResponse.json({ ok: true, already_delivered: true })
  }

  // ── Track this attempt ────────────────────────────────────────────────────
  const attempt = (row.delivery_attempts as number) + 1
  await supabase
    .from('rate_requests')
    .update({ delivery_attempts: attempt })
    .eq('id', payload.request_id)

  // ── Build webhook payload ─────────────────────────────────────────────────
  const breakdown = row.breakdown as Record<string, unknown> | null
  const webhookBody =
    row.status === 'completed'
      ? JSON.stringify({
          request_id: payload.request_id,
          status: 'completed',
          ups: breakdown?.ups ?? null,
          fedex: breakdown?.fedex ?? null,
          warnings: breakdown?.warnings ?? [],
        })
      : JSON.stringify({
          request_id: payload.request_id,
          status: 'failed',
          error: {
            code: 'CALCULATION_ERROR',
            message: 'Rate calculation failed. See request logs for details.',
          },
        })

  const signature = await hmacSign(payload.key_hash, webhookBody)

  // ── POST to callback_url ──────────────────────────────────────────────────
  let deliveryOk = false
  try {
    const res = await fetch(payload.callback_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Logifacts-Signature': `sha256=${signature}`,
        'X-Logifacts-Request-Id': payload.request_id,
      },
      body: webhookBody,
      signal: AbortSignal.timeout(10_000),
    })
    deliveryOk = res.ok
  } catch {
    deliveryOk = false
  }

  if (deliveryOk) {
    await supabase
      .from('rate_requests')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', payload.request_id)

    return NextResponse.json({ ok: true })
  }

  // ── Delivery failed ───────────────────────────────────────────────────────
  // Check QStash retry headers to know if this is the final attempt.
  const retriesRemaining = parseInt(req.headers.get('Upstash-Retry-Remaining') ?? '0', 10)

  if (retriesRemaining === 0) {
    // All attempts exhausted — mark permanently failed
    await supabase
      .from('rate_requests')
      .update({ status: 'delivery_failed' })
      .eq('id', payload.request_id)

    // Return 200 so QStash stops retrying
    return NextResponse.json({ ok: false, delivery_failed: true }, { status: 200 })
  }

  // Return 5xx so QStash retries this job
  return NextResponse.json({ error: 'Webhook delivery failed, will retry.' }, { status: 503 })
}
