import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { hashApiKey } from '@/lib/api/base-url'
import { apiError, Err } from '@/lib/api/errors'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params
  const supabase = createAdminClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return apiError(Err.unauthorized(), 401)

  const keyHash = await hashApiKey(authHeader.slice(7).trim())

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, customer_id')
    .eq('key_hash', keyHash)
    .eq('active', true)
    .maybeSingle()

  if (!keyRow) return apiError(Err.invalidKey(), 401)

  // ── Fetch request — scoped to this customer ───────────────────────────────
  const { data: row, error } = await supabase
    .from('rate_requests')
    .select('id, status, breakdown, created_at, completed_at, delivered_at, delivery_attempts, callback_url')
    .eq('id', requestId)
    .eq('customer_id', keyRow.customer_id)
    .maybeSingle()

  if (error) return apiError(Err.internal('Failed to fetch request.'), 500)
  if (!row)  return apiError(Err.notFound(), 404)

  const status    = row.status as string
  const breakdown = row.breakdown as Record<string, unknown> | null

  const result =
    status === 'completed' && breakdown
      ? { ups: breakdown.ups ?? null, fedex: breakdown.fedex ?? null }
      : null

  // `error` = calculation failed; `delivery_failed` = webhook delivery exhausted
  const deliveryError =
    status === 'delivery_failed'
      ? { code: 'DELIVERY_FAILED', message: 'Webhook delivery failed after all retry attempts.' }
      : null

  return NextResponse.json({
    request_id:  row.id,
    status,
    ...(result        && { result }),
    ...(deliveryError && { error: deliveryError }),
    created_at:  row.created_at,
    updated_at:  row.completed_at ?? row.created_at,
    ...(row.callback_url && {
      webhook: {
        callback_url:       row.callback_url,
        delivery_attempts:  row.delivery_attempts,
        delivered_at:       row.delivered_at ?? null,
      },
    }),
  })
}
