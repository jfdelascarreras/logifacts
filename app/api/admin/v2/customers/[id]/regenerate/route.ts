import { NextResponse } from 'next/server'

import { getAdminContext } from '@/lib/admin/getAdminContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateApiKey, hashApiKey } from '@/lib/api/base-url'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { id: customerId } = await params
  const supabase = createAdminClient()

  const plaintext = generateApiKey()
  const keyHash = await hashApiKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)

  // Insert new key first — if this fails the old key stays active (customer is never locked out).
  const { data: newKey, error: insertErr } = await supabase
    .from('api_keys')
    .insert({ customer_id: customerId, key_hash: keyHash, key_prefix: keyPrefix, active: true })
    .select('id')
    .single()

  if (insertErr || !newKey) {
    return NextResponse.json({ error: 'Failed to generate new key.' }, { status: 500 })
  }

  // Revoke all previous active keys — exclude the one just created.
  await supabase
    .from('api_keys')
    .update({ active: false, revoked_at: new Date().toISOString(), revoked_reason: 'regenerated' })
    .eq('customer_id', customerId)
    .eq('active', true)
    .neq('id', newKey.id)

  return NextResponse.json({ api_key: plaintext, key_prefix: `lf_${keyPrefix}` })
}
