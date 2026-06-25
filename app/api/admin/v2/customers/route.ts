import { NextResponse } from 'next/server'

import { getAdminContext } from '@/lib/admin/getAdminContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateApiKey, hashApiKey } from '@/lib/api/base-url'

export async function POST(req: Request) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    customer_id: rawId,
    name: rawName,
    email: rawEmail,
    enforce_discounts: rawEnforce,
    default_dimensions: rawDims,
  } = body as Record<string, unknown>

  if (typeof rawId !== 'string' || !/^[a-z0-9_]+$/.test(rawId)) {
    return NextResponse.json(
      { error: 'customer_id must be lowercase letters, numbers, and underscores.' },
      { status: 422 },
    )
  }
  if (typeof rawName !== 'string' || !rawName.trim()) {
    return NextResponse.json({ error: 'name is required.' }, { status: 422 })
  }
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 422 })
  }

  const supabase = createAdminClient()

  // Invite creates a pending Supabase user and sends an invite email.
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    rawEmail.trim(),
    { data: { full_name: rawName.trim() } },
  )
  if (inviteErr || !inviteData?.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? 'Failed to invite user.' },
      { status: 500 },
    )
  }

  const userId = inviteData.user.id

  // Generate and hash the API key before touching the DB — rollback is simpler.
  const plaintext = generateApiKey()
  const keyHash = await hashApiKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)

  const dims =
    rawDims &&
    typeof rawDims === 'object' &&
    'length' in rawDims &&
    'width' in rawDims &&
    'height' in rawDims
      ? rawDims
      : null

  // Create the customer record.
  const { data: customer, error: customerErr } = await supabase
    .from('customers')
    .insert({
      customer_id: rawId,
      user_id: userId,
      name: rawName.trim(),
      enforce_discounts: rawEnforce === true,
      ...(dims ? { default_dimensions: dims } : {}),
    })
    .select('customer_id, name, user_id, created_at')
    .single()

  if (customerErr) {
    await supabase.auth.admin.deleteUser(userId)
    if (customerErr.code === '23505') {
      return NextResponse.json(
        { error: `customer_id "${rawId}" is already in use.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Failed to create customer.' }, { status: 500 })
  }

  // Create the API key record.
  const { error: keyErr } = await supabase.from('api_keys').insert({
    customer_id: rawId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    active: true,
  })

  if (keyErr) {
    await supabase.from('customers').delete().eq('customer_id', rawId)
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create API key.' }, { status: 500 })
  }

  // Check whether contract discounts already exist (unlikely for new users but worth noting).
  const { data: discounts } = await supabase
    .from('user_contract_discounts')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return NextResponse.json(
    {
      customer,
      api_key: plaintext,
      key_prefix: `lf_${keyPrefix}`,
      has_discounts: !!discounts,
    },
    { status: 201 },
  )
}
