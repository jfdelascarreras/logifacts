import { describe, expect, it } from 'vitest'

import { buildMastermindConfirmationEmail } from '@/lib/mastermind/confirmation-email'
import {
  MASTERMIND_SESSION_WHEN,
  MASTERMIND_TEAMS_JOIN_URL,
} from '@/lib/mastermind/constants'

describe('buildMastermindConfirmationEmail', () => {
  it('includes session details and the Teams link', () => {
    const email = buildMastermindConfirmationEmail({
      fullName: 'Jane Smith',
      email: 'jane@company.com',
    })

    expect(email.subject).toContain(MASTERMIND_SESSION_WHEN)
    expect(email.text).toContain('Hi Jane,')
    expect(email.text).toContain(MASTERMIND_TEAMS_JOIN_URL)
    expect(email.html).toContain(MASTERMIND_TEAMS_JOIN_URL)
    expect(email.html).toContain('Join on Microsoft Teams')
  })

  it('builds a calendar invite attachment', () => {
    const email = buildMastermindConfirmationEmail({
      fullName: 'Jane Smith',
      email: 'jane@company.com',
    })

    expect(email.calendarInvite.filename).toBe('logifacts-mastermind.ics')
    expect(email.calendarInvite.content).toContain('BEGIN:VCALENDAR')
    expect(email.calendarInvite.content).toContain(MASTERMIND_TEAMS_JOIN_URL)
    expect(email.calendarInvite.content).toContain('DTSTART:20260625T170000Z')
    expect(email.calendarInvite.content).toContain('DTEND:20260625T174500Z')
  })
})
