import { NextResponse } from 'next/server'

import { getAdminContext } from '@/lib/admin/getAdminContext'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { id: customerId } = await params
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('api_keys')
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_reason: 'admin_revoked',
    })
    .eq('customer_id', customerId)
    .eq('active', true)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: 'Revoke failed.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
