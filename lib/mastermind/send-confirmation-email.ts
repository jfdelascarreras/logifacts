import { buildMastermindConfirmationEmail, type MastermindConfirmationEmailInput } from '@/lib/mastermind/confirmation-email'

export type SendMastermindConfirmationEmailResult =
  | { sent: true; provider: 'resend'; id: string }
  | { sent: false; reason: 'missing_api_key' | 'missing_from_address' | 'provider_error'; message: string }

type ResendEmailResponse = {
  id?: string
  message?: string
}

function getResendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? ''
}

function getResendFromAddress(): string {
  return process.env.RESEND_FROM?.trim() ?? ''
}

export async function sendMastermindConfirmationEmail(
  input: MastermindConfirmationEmailInput
): Promise<SendMastermindConfirmationEmailResult> {
  const apiKey = getResendApiKey()
  if (!apiKey) {
    return {
      sent: false,
      reason: 'missing_api_key',
      message: 'RESEND_API_KEY is not configured.',
    }
  }

  const from = getResendFromAddress()
  if (!from) {
    return {
      sent: false,
      reason: 'missing_from_address',
      message: 'RESEND_FROM is not configured.',
    }
  }

  const email = buildMastermindConfirmationEmail(input)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.email.trim()],
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: email.calendarInvite.filename,
          content: Buffer.from(email.calendarInvite.content, 'utf8').toString('base64'),
        },
      ],
    }),
  })

  const payload = (await response.json()) as ResendEmailResponse

  if (!response.ok) {
    return {
      sent: false,
      reason: 'provider_error',
      message: payload.message ?? `Resend returned HTTP ${response.status}.`,
    }
  }

  return {
    sent: true,
    provider: 'resend',
    id: payload.id ?? 'unknown',
  }
}
