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
  <body style="margin:0;padding:0;background:#dbe6ef;font-family:Arial,Helvetica,sans-serif;color:#12284b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#dbe6ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #a2c7e2;">

            <!-- Header -->
            <tr>
              <td style="background:#12284b;padding:28px 32px 24px;">
                <!-- Wordmark -->
                <p style="margin:0 0 20px;font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1;">
                  <span style="color:#ffffff;">Logi</span><span style="color:#f0493e;">Facts</span>
                </p>
                <!-- Label + headline -->
                <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#a2c7e2;font-weight:600;">Mastermind · Confirmation</p>
                <h1 style="margin:0;font-size:30px;font-weight:800;line-height:1.2;color:#ffffff;">You&rsquo;re in, ${firstName}.</h1>
              </td>
            </tr>

            <!-- Date strip -->
            <tr>
              <td style="background:#f0493e;padding:12px 32px;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff;letter-spacing:0.04em;">&#128197;&nbsp; ${MASTERMIND_SESSION_WHEN} &nbsp;&middot;&nbsp; ${MASTERMIND_SESSION_DURATION}</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#12284b;">
                  Your spot is confirmed for our free Mastermind conversation. We&rsquo;ll explore how to re-imagine the way you measure your business &mdash; what&rsquo;s working, what isn&rsquo;t, and how to close the gap.
                </p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#12284b;">
                  Use the button below to join on Teams. A calendar invite (.ics) is attached so you can save the session right now.
                </p>

                <!-- CTA -->
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="border-radius:8px;background:#f0493e;">
                      <a href="${MASTERMIND_TEAMS_JOIN_URL}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                        Join on Microsoft Teams &#8594;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Fallback link -->
                <p style="margin:0 0 4px;font-size:13px;color:#274673;">Can&rsquo;t click the button? Copy this link:</p>
                <p style="margin:0 0 32px;font-size:13px;word-break:break-all;">
                  <a href="${MASTERMIND_TEAMS_JOIN_URL}" style="color:#f0493e;text-decoration:underline;">teams.microsoft.com &rarr; LogiFacts Mastermind</a>
                </p>

                <!-- Divider -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr><td style="border-top:1px solid #dbe6ef;"></td></tr>
                </table>

                <p style="margin:0;font-size:15px;line-height:1.6;color:#12284b;">See you there,<br /><strong>The LogiFacts team</strong></p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#12284b;padding:16px 32px;">
                <p style="margin:0;font-size:12px;color:#a2c7e2;text-align:center;">
                  &copy; 2026 LogiFacts &nbsp;&middot;&nbsp;
                  <a href="https://logifacts.com" style="color:#a2c7e2;text-decoration:none;">logifacts.com</a>
                </p>
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
