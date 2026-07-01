import { NextResponse } from 'next/server'

import { registerMastermindAttendee } from '@/lib/mastermind/register-attendee'
import { createClient } from '@/lib/supabase/server'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let body: { email?: string }
  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const email = body.email?.trim() ?? ''
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  try {
    const registration = await registerMastermindAttendee(supabase, {
      email,
      fullName: '',
      companyName: '',
      userId: user?.id ?? null,
    })
    return NextResponse.json({ ok: true, alreadyRegistered: registration.alreadyRegistered })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
