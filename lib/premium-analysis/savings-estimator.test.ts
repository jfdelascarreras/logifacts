import { describe, expect, it } from 'vitest'

import type { AnomalyFlag } from '@/lib/premium-analysis/agents-types'
import { estimateSavings } from '@/lib/premium-analysis/savings-estimator'

describe('estimateSavings', () => {
  it('caps annualized high estimate at annualized total spend', () => {
    const flags: AnomalyFlag[] = [
      {
        type: 'avoidable_expedited',
        trackingNumber: '1',
        invoiceNumber: 'INV',
        amount: 200_000,
        description: 'test',
        severity: 'medium',
      },
      {
        type: 'accessorial_rate_high',
        trackingNumber: null,
        invoiceNumber: null,
        amount: 100_000,
        description: 'test',
        severity: 'high',
      },
    ]

    const monthlySpend = [
      { month: 'January 2025', totalCost: 20_000 },
      { month: 'February 2025', totalCost: 20_000 },
      { month: 'March 2025', totalCost: 20_000 },
      { month: 'April 2025', totalCost: 20_000 },
    ]

    const result = estimateSavings(flags, monthlySpend, 80_000)

    expect(result.annualizedBasisMonths).toBe(4)
    // Period flag totals (300k) scaled to 80k spend before annualization; high still ≤ annualized spend
    expect(result.high).toBeLessThanOrEqual(240_000)
    expect(result.high).toBeCloseTo(132_000, -3)
    expect(result.low).toBeLessThanOrEqual(result.high)
  })

  it('leaves estimates unchanged when below spend cap', () => {
    const flags: AnomalyFlag[] = [
      {
        type: 'address_correction',
        trackingNumber: '1',
        invoiceNumber: 'INV',
        amount: 15,
        description: 'test',
        severity: 'medium',
      },
    ]

    const monthlySpend = [{ month: 'January 2025', totalCost: 10_000 }]
    const result = estimateSavings(flags, monthlySpend, 10_000)

    expect(result.high).toBeCloseTo(180, 0)
  })
})
