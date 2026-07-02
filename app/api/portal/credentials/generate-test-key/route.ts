import { NextResponse } from 'next/server'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey, hashApiKey } from '@/lib/api/base-url'

// Generates or regenerates a sandbox test key (key_type = 'test').
// Test keys are independent of live keys — live key is never invalidated here.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } }, { status: 401 })

  const ctx = await getCustomerContext(user.id)
  if (!ctx) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No portal access configured.' } }, { status: 403 })

  const plaintext = `lf_test_${generateApiKey()}`
  const keyHash   = await hashApiKey(plaintext)
  const keyPrefix = plaintext.slice(0, 12) // "lf_test_XXXX"

  const admin = createAdminClient()

  const { data: newKey, error: insertErr } = await admin
    .from('api_keys')
    .insert({
      customer_id: ctx.customer_id,
      key_hash:    keyHash,
      key_prefix:  keyPrefix,
      key_type:    'test',
      active:      true,
    })
    .select('id')
    .single()

  if (insertErr || !newKey) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate test key. Please try again.' } },
      { status: 500 },
    )
  }

  // Deactivate previous test keys (not live keys)
  await admin
    .from('api_keys')
    .update({ active: false, revoked_at: new Date().toISOString(), revoked_reason: 'regenerated' })
    .eq('customer_id', ctx.customer_id)
    .eq('key_type', 'test')
    .eq('active', true)
    .neq('id', newKey.id)

  return NextResponse.json({ key: plaintext, prefix: keyPrefix }, { status: 201 })
}
