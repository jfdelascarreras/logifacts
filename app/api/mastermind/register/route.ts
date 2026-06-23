import { NextResponse } from 'next/server'

import { registerMastermindAttendee } from '@/lib/mastermind/register-attendee'
import { sendMastermindConfirmationEmail } from '@/lib/mastermind/send-confirmation-email'
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

    let emailDelivery:
      | { sent: true; provider: 'resend'; id: string }
      | { sent: false; reason: string; message: string }
      | null = null

    if (!registration.alreadyRegistered) {
      const delivery = await sendMastermindConfirmationEmail({ email, fullName })
      emailDelivery = delivery.sent
        ? delivery
        : {
            sent: false,
            reason: delivery.reason,
            message: delivery.message,
          }

      if (!delivery.sent && process.env.NODE_ENV !== 'production') {
        console.warn('[mastermind] confirmation email not sent:', delivery.message)
      }
    }

    return NextResponse.json({
      ok: true,
      registration,
      emailDelivery,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save registration.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
