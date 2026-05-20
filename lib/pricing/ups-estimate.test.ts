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

// Ground 5 lbs zone 5: published $18.65
// Discounts: svc 35% + tier 16% + PLD 5% = 56%
// netTC = 18.65 × 0.44 = 8.206
// fuel  = 8.206 × 0.172 = 1.4115
// total = 9.617

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
  it('Ground 5 lbs Chicago→NYC: correct published rate and discounts', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.publishedRate).toBe(18.65)
    expect(b.serviceIncentivePct).toBe(0.35)
    expect(b.tierIncentivePct).toBe(0.16)
    expect(b.pldBonusPct).toBe(0.05)
    expect(b.totalDiscountPct).toBe(0.56)
    expect(b.netTransportationCharge).toBeCloseTo(8.206, 2)
    expect(b.fuelSurcharge).toBeCloseTo(1.411, 2)
    expect(b.residentialSurcharge).toBe(0)
    expect(b.totalEstimatedCharge).toBeCloseTo(9.617, 2)
  })

  it('Ground service incentive steps with weight (9 lbs = 38%, 11 lbs = 41%)', () => {
    const r9 = estimateUPS({ weightLbs: 9, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r9.ok).toBe(true)
    if (!r9.ok) return
    expect(r9.breakdown.serviceIncentivePct).toBe(0.38) // ≤10 lbs tier
    expect(r9.breakdown.totalDiscountPct).toBeCloseTo(0.59, 2)

    const r11 = estimateUPS({ weightLbs: 11, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r11.ok).toBe(true)
    if (!r11.ok) return
    expect(r11.breakdown.serviceIncentivePct).toBe(0.41) // ≤20 lbs tier
  })

  it('adds residential surcharge of $2.52', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: true, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.residentialSurcharge).toBe(2.52)
    expect(r.breakdown.totalEstimatedCharge).toBeCloseTo(9.617 + 2.52, 1)
  })

  it('NDA 5 lbs Chicago→NYC: correct zone and published rate', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'nda', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.zone).toBe(105)
    expect(b.publishedRate).toBe(129.93)
    expect(b.totalDiscountPct).toBeCloseTo(0.714, 3)
    expect(b.netTransportationCharge).toBeCloseTo(37.16, 1)
  })

  it('3-Day 5 lbs Chicago→NYC: zone 305', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: '3day', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(305)
    expect(r.breakdown.publishedRate).toBe(41.01)
  })

  it('NDA Saver flags estimatedContractTerms', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'nda_saver', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.estimatedContractTerms).toBe(true)
  })

  it('Ground does not flag estimatedContractTerms', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.estimatedContractTerms).toBe(false)
  })
})
