import { describe, expect, it } from 'vitest'

import {
  MASTERMIND_EVENT_SLUG,
  MASTERMIND_SESSION_DURATION,
  MASTERMIND_SESSION_WHEN,
  MASTERMIND_TEAMS_JOIN_URL,
} from '@/lib/mastermind/constants'

describe('mastermind constants', () => {
  it('uses a stable event slug', () => {
    expect(MASTERMIND_EVENT_SLUG).toBe('upcoming-mastermind')
  })

  it('provides a Teams join URL', () => {
    expect(MASTERMIND_TEAMS_JOIN_URL).toMatch(/^https:\/\/teams\.microsoft\.com\//)
  })

  it('schedules the first session for June 25 at noon Eastern', () => {
    expect(MASTERMIND_SESSION_WHEN).toBe('Thursday, June 25th at 12:00 p.m. EST')
  })

  it('runs for 45 minutes', () => {
    expect(MASTERMIND_SESSION_DURATION).toBe('45-minute')
  })
})
