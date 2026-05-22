import { describe, expect, it } from 'vitest'
import { mape, trainHoldoutSplit } from './metrics'

describe('mape', () => {
  it('computes mean absolute percentage error', () => {
    // |100-110|/100 = 0.1, |200-190|/200 = 0.05, |300-310|/300 = 0.0333
    const result = mape([100, 200, 300], [110, 190, 310])
    expect(result).toBeCloseTo((0.1 + 0.05 + 1 / 30) / 3, 6)
  })

  it('returns null when any actual value is zero', () => {
    expect(mape([100, 0, 300], [100, 50, 300])).toBeNull()
  })

  it('returns null for empty arrays', () => {
    expect(mape([], [])).toBeNull()
  })

  it('returns null for mismatched lengths', () => {
    expect(mape([100, 200], [100])).toBeNull()
  })

  it('returns 0 for perfect predictions', () => {
    expect(mape([100, 200, 300], [100, 200, 300])).toBe(0)
  })
})

describe('trainHoldoutSplit', () => {
  const series = [
    { period: '2025-01', value: 100 },
    { period: '2025-02', value: 200 },
    { period: '2025-03', value: 300 },
    { period: '2025-04', value: 400 },
    { period: '2025-05', value: 500 },
  ]

  it('splits into train and holdout', () => {
    const { train, holdout } = trainHoldoutSplit(series, 2)
    expect(train).toHaveLength(3)
    expect(holdout).toHaveLength(2)
    expect(train[train.length - 1]?.period).toBe('2025-03')
    expect(holdout[0]?.period).toBe('2025-04')
  })

  it('clamps when holdout >= series length', () => {
    const { train, holdout } = trainHoldoutSplit(series, 10)
    expect(train).toHaveLength(0)
    expect(holdout).toHaveLength(5)
  })
})
