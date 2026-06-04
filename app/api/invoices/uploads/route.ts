import { NextResponse } from 'next/server'

import { listUserInvoiceUploads } from '@/lib/invoices/upload-management'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const uploads = await listUserInvoiceUploads(supabase, user.id)
    return NextResponse.json({ uploads })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list uploads'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
