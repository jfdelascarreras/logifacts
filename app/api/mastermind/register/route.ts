import { NextResponse } from 'next/server'

import { registerMastermindAttendee } from '@/lib/mastermind/register-attendee'
import { createClient } from '@/lib/supabase/server'

type RegisterBody = {
  fullName?: string
  companyName?: string
  email?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const fullName = body.fullName?.trim() ?? ''
  const companyName = body.companyName?.trim() ?? ''
  const email = body.email?.trim() ?? ''

  if (!fullName) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  if (!companyName) {
    return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const accountEmail = user?.email?.trim().toLowerCase() ?? ''
  if (user && accountEmail && accountEmail !== email.toLowerCase()) {
    return NextResponse.json(
      { error: 'Use the email address on your LogiFacts account, or sign out to register with a different email.' },
      { status: 400 }
    )
  }

  try {
    const registration = await registerMastermindAttendee(supabase, {
      email,
      fullName,
      companyName,
      userId: user?.id ?? null,
    })

    return NextResponse.json({
      ok: true,
      registration,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save registration.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
