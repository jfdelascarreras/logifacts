import { NextResponse } from 'next/server'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function generateKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashKey(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const ctx = await getCustomerContext(user.id)
  if (!ctx) return NextResponse.json({ error: 'No portal access configured.' }, { status: 403 })

  const plaintext = generateKey()
  const keyHash = await hashKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)

  const admin = createAdminClient()

  // INSERT new key first — if this fails, the old key is untouched and the customer is not locked out
  const { data: newKey, error: insertErr } = await admin
    .from('api_keys')
    .insert({
      customer_id: ctx.customer_id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      active: true,
    })
    .select('id')
    .single()

  if (insertErr || !newKey) {
    return NextResponse.json(
      { error: 'Failed to generate new API key. Please try again.' },
      { status: 500 },
    )
  }

  // Deactivate all other active keys for this customer
  await admin
    .from('api_keys')
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_reason: 'regenerated',
    })
    .eq('customer_id', ctx.customer_id)
    .eq('active', true)
    .neq('id', newKey.id)

  // Plaintext is returned exactly once and never stored
  return NextResponse.json({ key: plaintext, prefix: keyPrefix }, { status: 201 })
}
