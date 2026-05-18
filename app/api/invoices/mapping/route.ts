import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Carrier } from '@/types/invoice'

interface MappingPayload {
  charge_description: string
  carrier: Carrier
  transportation_mode?: string
  category_1?: string
  category_2?: string
  category_3?: string
  category_4?: string
  category_5?: string
  standardized_charge?: string
}

/** Upsert a single charge_description into master_mapping. */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = (await request.json()) as MappingPayload

  if (!body.charge_description || !body.carrier) {
    return NextResponse.json({ error: 'charge_description and carrier are required' }, { status: 400 })
  }

  const { error } = await supabase.from('master_mapping').upsert(
    {
      charge_description: body.charge_description,
      carrier: body.carrier,
      transportation_mode: body.transportation_mode ?? null,
      category_1: body.category_1 ?? null,
      category_2: body.category_2 ?? null,
      category_3: body.category_3 ?? null,
      category_4: body.category_4 ?? null,
      category_5: body.category_5 ?? null,
      standardized_charge: body.standardized_charge ?? null,
    },
    { onConflict: 'carrier,charge_description' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Re-map invoice_lines that have this charge_description and are currently unmapped
  await supabase
    .from('invoice_lines')
    .update({
      transportation_mode: body.transportation_mode ?? null,
      category_1: body.category_1 ?? null,
      category_2: body.category_2 ?? null,
      category_3: body.category_3 ?? null,
      category_4: body.category_4 ?? null,
      category_5: body.category_5 ?? null,
      standardized_charge: body.standardized_charge ?? null,
      mapped: true,
    })
    .eq('charge_description', body.charge_description)
    .eq('carrier', body.carrier)
    .eq('mapped', false)

  return NextResponse.json({ ok: true })
}
