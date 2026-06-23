import {
  MASTERMIND_SESSION_DURATION,
  MASTERMIND_SESSION_START_ISO,
  MASTERMIND_SESSION_WHEN,
  MASTERMIND_TEAMS_JOIN_URL,
} from '@/lib/mastermind/constants'

export type MastermindConfirmationEmailInput = {
  fullName: string
  email: string
}

export type MastermindConfirmationEmailContent = {
  subject: string
  html: string
  text: string
  calendarInvite: {
    filename: string
    content: string
  }
}

const SESSION_END_ISO = new Date(
  new Date(MASTERMIND_SESSION_START_ISO).getTime() + 45 * 60 * 1000
).toISOString()

function formatIcsTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function buildCalendarInvite(): MastermindConfirmationEmailContent['calendarInvite'] {
  const description = [
    'Join the LogiFacts Mastermind on Microsoft Teams.',
    '',
    `Teams link: ${MASTERMIND_TEAMS_JOIN_URL}`,
    '',
    'Built for business leaders and analysts who are ready to think differently about performance.',
  ].join('\\n')

  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LogiFacts//Mastermind//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:mastermind-upcoming@logifacts.com',
    `DTSTAMP:${formatIcsTimestamp(new Date().toISOString())}`,
    `DTSTART:${formatIcsTimestamp(MASTERMIND_SESSION_START_ISO)}`,
    `DTEND:${formatIcsTimestamp(SESSION_END_ISO)}`,
    `SUMMARY:${escapeIcsText('LogiFacts Mastermind')}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText('Microsoft Teams')}`,
    `URL:${MASTERMIND_TEAMS_JOIN_URL}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return {
    filename: 'logifacts-mastermind.ics',
    content,
  }
}

export function buildMastermindConfirmationEmail(
  input: MastermindConfirmationEmailInput
): MastermindConfirmationEmailContent {
  const firstName = input.fullName.trim().split(/\s+/)[0] || 'there'
  const calendarInvite = buildCalendarInvite()

  const subject = `You're in — LogiFacts Mastermind on ${MASTERMIND_SESSION_WHEN}`

  const text = [
    `Hi ${firstName},`,
    '',
    `You're registered for the LogiFacts Mastermind on ${MASTERMIND_SESSION_WHEN}.`,
    '',
    `Session length: ${MASTERMIND_SESSION_DURATION}`,
    '',
    'Join on Microsoft Teams:',
    MASTERMIND_TEAMS_JOIN_URL,
    '',
    'We attached a calendar invite (.ics) so you can save the session to your calendar.',
    '',
    'See you there,',
    'The LogiFacts team',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#102033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4f0;">
            <tr>
              <td style="padding:28px 28px 12px;background:linear-gradient(135deg,#0f2744,#1f5f99);color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">LogiFacts Mastermind</p>
                <h1 style="margin:0;font-size:28px;line-height:1.25;">You're signed up</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${firstName},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                  Your spot is saved for our free ${MASTERMIND_SESSION_DURATION} Mastermind conversation on
                  <strong>${MASTERMIND_SESSION_WHEN}</strong>.
                </p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">
                  Use the Teams link below to join live. We also attached a calendar invite so you can add the session to your calendar.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${MASTERMIND_TEAMS_JOIN_URL}" style="display:inline-block;background:#1f5f99;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:16px;font-weight:700;">
                    Join on Microsoft Teams
                  </a>
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#516579;">If the button does not work, copy this link:</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-all;">
                  <a href="${MASTERMIND_TEAMS_JOIN_URL}" style="color:#1f5f99;">${MASTERMIND_TEAMS_JOIN_URL}</a>
                </p>
                <p style="margin:0;font-size:16px;line-height:1.6;">See you there,<br />The LogiFacts team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject,
    html,
    text,
    calendarInvite,
  }
}
