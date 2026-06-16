import { describe, expect, it } from 'vitest'

import { groundTransitDaysForZone, isAvoidableExpedited } from '@/lib/premium-analysis/transit-table'

describe('transit-table', () => {
  it('treats zone 0 as unknown transit', () => {
    expect(groundTransitDaysForZone(0)).toBeNull()
    expect(isAvoidableExpedited(0, 'FedEx Priority Overnight')).toBe(false)
  })

  it('flags expedited service in short-transit zones', () => {
    expect(isAvoidableExpedited(3, 'FedEx Priority Overnight')).toBe(true)
    expect(isAvoidableExpedited(8, 'FedEx Priority Overnight')).toBe(false)
  })
})
