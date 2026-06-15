import { describe, expect, it } from 'vitest'

import { MASTERMIND_EVENT_SLUG, MASTERMIND_TEAMS_JOIN_URL } from '@/lib/mastermind/constants'

describe('mastermind constants', () => {
  it('uses a stable event slug', () => {
    expect(MASTERMIND_EVENT_SLUG).toBe('upcoming-mastermind')
  })

  it('provides a Teams join URL', () => {
    expect(MASTERMIND_TEAMS_JOIN_URL).toMatch(/^https:\/\/teams\.microsoft\.com\//)
  })
})
