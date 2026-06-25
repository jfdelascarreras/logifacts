import { NextResponse } from 'next/server'

import { getAdminContext } from '@/lib/admin/getAdminContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashApiKey } from '@/lib/api/base-url'

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX64_RE = /^[0-9a-f]{64}$/i  // 32 bytes from `openssl rand -hex 32`

// Bootstrap an existing Supabase user as an API customer and register a caller-supplied key.
// Unlike POST /api/admin/v2/customers, this route does not invite a new user — use it when
// the user account already exists (e.g. migrating a legacy customer).
export async function POST(req: Request) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    customer_id: rawCustomerId,
    user_id: rawUserId,
    name: rawName,
    api_key: rawApiKey,
  } = body as Record<string, unknown>

  if (typeof rawCustomerId !== 'string' || !/^[a-z0-9_]+$/.test(rawCustomerId)) {
    return NextResponse.json(
      { error: 'customer_id must be lowercase letters, numbers, and underscores only.' },
      { status: 422 },
    )
  }
  if (typeof rawUserId !== 'string' || !UUID_RE.test(rawUserId)) {
    return NextResponse.json(
      { error: 'user_id must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' },
      { status: 422 },
    )
  }
  if (typeof rawApiKey !== 'string' || !HEX64_RE.test(rawApiKey)) {
    return NextResponse.json(
      { error: 'api_key must be a 64-character hex string. Generate with: openssl rand -hex 32' },
      { status: 422 },
    )
  }

  const supabase = createAdminClient()
  const warnings: string[] = []

  // Verify the user exists in Supabase auth before creating the customer record.
  const { data: authUser, error: userErr } = await supabase.auth.admin.getUserById(rawUserId)
  if (userErr || !authUser.user) {
    return NextResponse.json({ error: 'No user found for the provided user_id.' }, { status: 422 })
  }

  // Warn if contract discounts are missing — quotes will use published rates.
  const { data: discounts } = await supabase
    .from('user_contract_discounts')
    .select('user_id')
    .eq('user_id', rawUserId)
    .maybeSingle()

  if (!discounts) {
    warnings.push(
      'No contract discounts found for this user. ' +
      'Quotes will reflect published carrier rates until discounts are configured ' +
      'in the user_contract_discounts table.',
    )
  }

  // Insert customer — UNIQUE constraint on customer_id eliminates TOCTOU race.
  const { data: customer, error: insertErr } = await supabase
    .from('customers')
    .insert({
      customer_id: rawCustomerId,
      user_id: rawUserId,
      name: typeof rawName === 'string' ? rawName : rawCustomerId,
    })
    .select('id, customer_id, user_id, name, created_at')
    .single()

  if (insertErr || !customer) {
    if (insertErr?.code === '23505') {
      return NextResponse.json(
        { error: `customer_id "${rawCustomerId}" is already in use.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Failed to create customer.' }, { status: 500 })
  }

  // Hash and store the caller-supplied key. Roll back customer on failure.
  const keyHash = await hashApiKey(rawApiKey)
  const keyPrefix = rawApiKey.slice(0, 8)

  const { error: keyErr } = await supabase.from('api_keys').insert({
    customer_id: rawCustomerId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    active: true,
  })

  if (keyErr) {
    await supabase.from('customers').delete().eq('customer_id', rawCustomerId)
    return NextResponse.json({ error: 'Failed to register API key. Please retry.' }, { status: 500 })
  }

  return NextResponse.json(
    {
      customer,
      api_key_prefix: keyPrefix,
      ...(warnings.length > 0 && { warnings }),
    },
    { status: 201 },
  )
}
