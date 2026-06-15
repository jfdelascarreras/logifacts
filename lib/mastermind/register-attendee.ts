import type { SupabaseClient } from '@supabase/supabase-js'

import { MASTERMIND_EVENT_SLUG } from '@/lib/mastermind/constants'

export type MastermindRegistrationInput = {
  email: string
  fullName: string
  companyName: string
  userId?: string | null
  eventSlug?: string
}

export type MastermindRegistrationResult = {
  email: string
  fullName: string
  companyName: string
  alreadyRegistered: boolean
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || (error.message?.includes('duplicate key') ?? false)
}

function buildResult(
  input: MastermindRegistrationInput,
  alreadyRegistered: boolean
): MastermindRegistrationResult {
  return {
    email: input.email.trim(),
    fullName: input.fullName.trim(),
    companyName: input.companyName.trim(),
    alreadyRegistered,
  }
}

export async function registerMastermindAttendee(
  supabase: SupabaseClient,
  input: MastermindRegistrationInput
): Promise<MastermindRegistrationResult> {
  const email = input.email.trim()
  const fullName = input.fullName.trim()
  const companyName = input.companyName.trim()
  const eventSlug = input.eventSlug?.trim() || MASTERMIND_EVENT_SLUG
  const emailNormalized = normalizeEmail(email)

  const rowPayload = {
    event_slug: eventSlug,
    email,
    full_name: fullName,
    company_name: companyName,
    user_id: input.userId ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error: insertError } = await supabase.from('mastermind_registrations').insert(rowPayload)

  if (!insertError) {
    return buildResult(input, false)
  }

  if (!isUniqueViolation(insertError)) {
    throw new Error(insertError.message)
  }

  if (input.userId) {
    const { error: updateError } = await supabase
      .from('mastermind_registrations')
      .update({
        full_name: fullName,
        company_name: companyName,
        user_id: input.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('event_slug', eventSlug)
      .eq('email_normalized', emailNormalized)

    if (updateError && !isUniqueViolation(updateError)) {
      throw new Error(updateError.message)
    }
  }

  return buildResult(input, true)
}
