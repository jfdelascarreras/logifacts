import { NextResponse } from 'next/server'

import { resolveFuelSurchargeRates } from '@/lib/cache/ups-fuel-surcharge-cache'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rates = await resolveFuelSurchargeRates({ warmCache: true })
  if (!rates) {
    return NextResponse.json(
      { error: 'Fuel surcharge rate unavailable.' },
      { status: 503 }
    )
  }

  return NextResponse.json(rates)
}
