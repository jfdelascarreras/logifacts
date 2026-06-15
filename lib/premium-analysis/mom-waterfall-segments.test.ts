import { describe, expect, it } from 'vitest'

import {
  baseFreightCost,
  buildMomWaterfallSegments,
  nonFuelSurchargeCost,
  partitionMatchesTotal,
} from './mom-waterfall-segments'

describe('mom-waterfall-segments', () => {
  it('partitions FedEx-like month where surcharges equal fuel (no double count)', () => {
    const dec = { totalCost: 46_403, costFuel: 5_942, costSurcharges: 5_942, costAccessorials: 117 }
    const jan = { totalCost: 85_308, costFuel: 11_692, costSurcharges: 11_692, costAccessorials: 447 }

    expect(partitionMatchesTotal(dec)).toBe(true)
    expect(partitionMatchesTotal(jan)).toBe(true)
    expect(nonFuelSurchargeCost(dec)).toBe(0)
    expect(nonFuelSurchargeCost(jan)).toBe(0)

    const segments = buildMomWaterfallSegments(jan, dec)
    const fuel = segments.find((s) => s.label === 'Fuel')!
    const other = segments.find((s) => s.label === 'Other surcharges')!
    const base = segments.find((s) => s.label === 'Base Freight')!

    expect(fuel.delta).toBeCloseTo(11_692 - 5_942, 6)
    expect(other.delta).toBe(0)
    expect(base.delta).toBeCloseTo(baseFreightCost(jan) - baseFreightCost(dec), 6)

    const totalDelta = jan.totalCost - dec.totalCost
    expect(segments.reduce((s, seg) => s + seg.delta, 0)).toBeCloseTo(totalDelta, 6)
  })

  it('splits non-fuel surcharges when peak lines exist', () => {
    const prev = { totalCost: 100, costFuel: 20, costSurcharges: 30, costAccessorials: 10 }
    const curr = { totalCost: 150, costFuel: 25, costSurcharges: 45, costAccessorials: 15 }

    expect(nonFuelSurchargeCost(prev)).toBe(10)
    expect(nonFuelSurchargeCost(curr)).toBe(20)

    const segments = buildMomWaterfallSegments(curr, prev)
    expect(segments.find((s) => s.label === 'Fuel')!.delta).toBe(5)
    expect(segments.find((s) => s.label === 'Other surcharges')!.delta).toBe(10)
    expect(segments.reduce((s, seg) => s + seg.delta, 0)).toBe(50)
  })
})
