import { describe, expect, it } from 'vitest'

import { estimateUPS } from './ups-estimate'
import type { ZoneChart } from './types'

// Zone 601 (Chicago area): verified spot-checks from zone-charts/601.json
// dest 100 (10001 NYC)  → ground:5, 3day:305, 2day:205, nda_saver:135, nda:105
// dest 606 (60601 CHI)  → ground:2 (local)
// dest 900 (90001 LA)   → ground:7
// dest 006 (00601 PR)   → ground:45, 3day:null (not available)
import chart601Json from './data/zone-charts/601.json'
const CHART_601 = chart601Json as unknown as ZoneChart

describe('estimateUPS — input validation', () => {
  it('errors on weight = 0', () => {
    const r = estimateUPS({ weightLbs: 0, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/weight/i)
  })

  it('errors on negative weight', () => {
    const r = estimateUPS({ weightLbs: -1, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(false)
  })
})

describe('estimateUPS — zone lookup', () => {
  it('resolves zone 5 for Chicago→NYC Ground', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(5)
  })

  it('resolves local zone 2 for Chicago→Chicago', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '60601', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(2)
  })

  it('resolves zone 7 for Chicago→LA', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '90001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(7)
  })

  it('errors when service not available to destination (3-Day to Puerto Rico)', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '00601', service: '3day', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(false)
  })

  it('errors when dest prefix not in chart', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '00001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(false)
  })
})

describe('estimateUPS — billable weight', () => {
  it('uses actual weight when no dimensions given', () => {
    const r = estimateUPS({ weightLbs: 5.3, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.billableWeightLbs).toBe(6) // ceil(5.3)
    expect(r.breakdown.billableWeightSource).toBe('actual')
    expect(r.breakdown.dimWeightLbs).toBeNull()
  })

  it('uses DIM weight (Ground divisor 220) when DIM > actual', () => {
    // DIM = ceil(20 × 15 × 10 / 220) = ceil(13.63) = 14
    const r = estimateUPS({
      weightLbs: 5,
      dimensionsIn: { length: 20, width: 15, height: 10 },
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dimWeightLbs).toBe(14)
    expect(r.breakdown.billableWeightLbs).toBe(14)
    expect(r.breakdown.billableWeightSource).toBe('dimensional')
  })

  it('uses actual weight when actual > DIM', () => {
    // DIM = ceil(5 × 5 × 5 / 220) = ceil(0.568) = 1 < 10 actual
    const r = estimateUPS({
      weightLbs: 10,
      dimensionsIn: { length: 5, width: 5, height: 5 },
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.billableWeightSource).toBe('actual')
    expect(r.breakdown.billableWeightLbs).toBe(10)
  })

  it('uses air DIM divisor (194) for NDA', () => {
    // DIM = ceil(20 × 15 × 10 / 194) = ceil(15.46) = 16
    const r = estimateUPS({
      weightLbs: 5,
      dimensionsIn: { length: 20, width: 15, height: 10 },
      destinationZip: '10001',
      service: 'nda',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dimWeightLbs).toBe(16)
    expect(r.breakdown.billableWeightLbs).toBe(16)
  })
})

describe('estimateUPS — rate calculation', () => {
  it('Ground 5 lbs Chicago→NYC: correct published rate, no discount by default', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.publishedRate).toBe(18.65)
    expect(b.contractDiscountPct).toBe(0)
    expect(b.netTransportationCharge).toBeCloseTo(18.65, 2)
    expect(b.fuelSurcharge).toBeCloseTo(18.65 * 0.172, 2)
    expect(b.residentialSurcharge).toBe(0)
    expect(b.totalEstimatedCharge).toBeCloseTo(18.65 * 1.172, 2)
  })

  it('applies contract discount correctly', () => {
    // 56% discount on Ground 5 lbs zone 5: netTC = 18.65 × 0.44 = 8.206
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscountPct: 0.56 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.contractDiscountPct).toBe(0.56)
    expect(b.netTransportationCharge).toBeCloseTo(8.206, 2)
    expect(b.fuelSurcharge).toBeCloseTo(1.411, 2)
    expect(b.totalEstimatedCharge).toBeCloseTo(9.617, 2)
  })

  it('caps discount at 95%', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscountPct: 0.99 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.contractDiscountPct).toBe(0.95)
  })

  it('adds residential surcharge of $2.52', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: true, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.residentialSurcharge).toBe(2.52)
  })

  it('NDA 5 lbs Chicago→NYC: correct zone and published rate', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'nda', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.zone).toBe(105)
    expect(b.publishedRate).toBe(129.93)
  })

  it('3-Day 5 lbs Chicago→NYC: zone 305 and published rate', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: '3day', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(305)
    expect(r.breakdown.publishedRate).toBe(41.01)
  })
})
