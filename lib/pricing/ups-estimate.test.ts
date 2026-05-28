import { describe, expect, it } from 'vitest'

import { estimateUPS } from './ups-estimate'
import { baseZone, isLargePackage, additionalHandlingTrigger, remoteAreaType, dasType, declaredValueCharge } from './ups-accessorials'
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
    expect(b.contractDiscounts.transportation).toBe(0)
    expect(b.netTransportationCharge).toBeCloseTo(18.65, 2)
    // fuel surcharge rate = domesticGround from most recent history entry (0.275)
    expect(b.fuelSurchargeRate).toBe(0.275)
    expect(b.fuelSurcharge).toBeCloseTo(18.65 * 0.275, 2)
    expect(b.residentialSurcharge).toBe(0)
    // 10001 = das_standard → groundCommercial $4.50
    expect(b.dasSurchargeType).toBe('standard')
    expect(b.dasSurcharge).toBe(4.50)
    expect(b.totalEstimatedCharge).toBeCloseTo(18.65 * 1.275 + 4.50, 2)
  })

  it('applies contract discount correctly', () => {
    // 56% discount on Ground 5 lbs zone 5: netTC = 18.65 × 0.44 = 8.206
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscounts: { transportation: 0.56 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.contractDiscounts.transportation).toBe(0.56)
    expect(b.netTransportationCharge).toBeCloseTo(8.206, 2)
    expect(b.fuelSurcharge).toBeCloseTo(8.206 * 0.275, 2)
    expect(b.totalEstimatedCharge).toBeCloseTo(8.206 * 1.275 + 4.50, 2)
  })

  it('caps discount at 95%', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscounts: { transportation: 0.99 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.contractDiscounts.transportation).toBe(0.95)
  })

  it('adds residential surcharge at list rate ($6.50 ground, no discount)', () => {
    // 77001 (Houston) has no DAS or remote entry — isolates residential surcharge
    const r = estimateUPS({ weightLbs: 5, destinationZip: '77001', service: 'ground', residential: true, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.residentialSurcharge).toBe(6.50)
    expect(r.breakdown.dasSurcharge).toBe(0)
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

describe('baseZone', () => {
  it('ground zones 2-8 pass through', () => {
    expect(baseZone(2, 'ground')).toBe(2)
    expect(baseZone(5, 'ground')).toBe(5)
    expect(baseZone(8, 'ground')).toBe(8)
  })
  it('ground territory zones (44/45/46) → 8', () => {
    expect(baseZone(44, 'ground')).toBe(8)
    expect(baseZone(45, 'ground')).toBe(8)
    expect(baseZone(46, 'ground')).toBe(8)
  })
  it('air zones extract correct base', () => {
    expect(baseZone(102, 'nda')).toBe(2)
    expect(baseZone(107, 'nda')).toBe(7)
    expect(baseZone(132, 'nda_saver')).toBe(2)
    expect(baseZone(138, 'nda_saver')).toBe(8)
    expect(baseZone(202, '2day')).toBe(2)
    expect(baseZone(242, '2day_am')).toBe(2)
    expect(baseZone(248, '2day_am')).toBe(8)
    expect(baseZone(302, '3day')).toBe(2)
    expect(baseZone(308, '3day')).toBe(8)
  })
  it('air territory zones (e.g. 125, 225) → 8', () => {
    expect(baseZone(125, 'nda')).toBe(8)
    expect(baseZone(225, '2day')).toBe(8)
  })
})

describe('isLargePackage', () => {
  it('triggers when longest side > 96 in', () => {
    expect(isLargePackage({ length: 97, width: 10, height: 10 })).toBe(true)
    // length=96, width=8, height=8: girth=32, total=128 ≤ 130 → not triggered
    expect(isLargePackage({ length: 96, width: 8, height: 8 })).toBe(false)
  })
  it('triggers when length + girth > 130 in', () => {
    // length=60, width=20, height=20 → girth=80, total=140 > 130
    expect(isLargePackage({ length: 60, width: 20, height: 20 })).toBe(true)
    // length=50, width=15, height=15 → girth=60, total=110 ≤ 130
    expect(isLargePackage({ length: 50, width: 15, height: 15 })).toBe(false)
  })
  it('uses longest side as length regardless of which field it is', () => {
    // width is longest → 97 in
    expect(isLargePackage({ length: 10, width: 97, height: 10 })).toBe(true)
  })
})

describe('additionalHandlingTrigger', () => {
  it('returns null for standard package', () => {
    expect(additionalHandlingTrigger(50, { length: 30, width: 20, height: 10 }, false)).toBe(null)
  })
  it('weight > 70 lbs → weight', () => {
    expect(additionalHandlingTrigger(71, { length: 30, width: 20, height: 10 }, false)).toBe('weight')
  })
  it('longest > 48 in → dimensions', () => {
    expect(additionalHandlingTrigger(10, { length: 49, width: 20, height: 10 }, false)).toBe('dimensions')
  })
  it('second-longest > 30 in → dimensions', () => {
    expect(additionalHandlingTrigger(10, { length: 40, width: 31, height: 10 }, false)).toBe('dimensions')
  })
  it('nonStandardPackaging flag → packaging', () => {
    expect(additionalHandlingTrigger(10, { length: 20, width: 10, height: 5 }, true)).toBe('packaging')
  })
  it('weight trigger takes priority over dimensions', () => {
    expect(additionalHandlingTrigger(80, { length: 49, width: 31, height: 10 }, true)).toBe('weight')
  })
})

describe('estimateUPS — large package and additional handling', () => {
  it('no surcharges for a standard 10 lb package', () => {
    const r = estimateUPS({ weightLbs: 10, dimensionsIn: { length: 18, width: 14, height: 10 }, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.largePackageSurcharge).toBe(0)
    expect(r.breakdown.additionalHandlingSurcharge).toBe(0)
    expect(r.breakdown.additionalHandlingTrigger).toBe(null)
  })

  it('large package surcharge applied for commercial ground zone 5 (dims trigger large pkg)', () => {
    // length=97 triggers large package. Zone 5 commercial rate = $273.00 list
    const r = estimateUPS({ weightLbs: 10, dimensionsIn: { length: 97, width: 10, height: 10 }, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.largePackageSurcharge).toBe(273.00)
    expect(r.breakdown.additionalHandlingSurcharge).toBe(0)
    expect(r.breakdown.additionalHandlingTrigger).toBe(null)
  })

  it('residential large package uses residential rate', () => {
    // Zone 5 residential rate = $320.50
    const r = estimateUPS({ weightLbs: 10, dimensionsIn: { length: 97, width: 10, height: 10 }, destinationZip: '10001', service: 'ground', residential: true, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.largePackageSurcharge).toBe(320.50)
  })

  it('additional handling weight trigger — ground zone 5 rate = $56.25 list', () => {
    // 80 lbs, no large package dims
    const r = estimateUPS({ weightLbs: 80, dimensionsIn: { length: 20, width: 15, height: 10 }, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.additionalHandlingTrigger).toBe('weight')
    expect(r.breakdown.additionalHandlingSurcharge).toBe(56.25)
    expect(r.breakdown.largePackageSurcharge).toBe(0)
  })

  it('additional handling discount applied', () => {
    // 50% additional handling discount on weight trigger zone 5 → $56.25 * 0.50 = $28.125
    const r = estimateUPS({ weightLbs: 80, dimensionsIn: { length: 20, width: 15, height: 10 }, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscounts: { additionalHandling: 0.50 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.additionalHandlingSurcharge).toBeCloseTo(28.125, 3)
  })
})

describe('remoteAreaType', () => {
  it('detects remote_alaska ZIP', () => {
    expect(remoteAreaType('99540')).toBe('alaska')
  })
  it('detects remote_hawaii ZIP', () => {
    expect(remoteAreaType('96703')).toBe('hawaii')
  })
  it('detects remote_us48 ZIP', () => {
    expect(remoteAreaType('01026')).toBe('us48')
  })
  it('returns null for DAS ZIP (not remote)', () => {
    expect(remoteAreaType('10001')).toBe(null)   // das_standard
    expect(remoteAreaType('99501')).toBe(null)   // Anchorage = das_standard, not remote
  })
  it('returns null for ZIP not in surcharges file', () => {
    expect(remoteAreaType('90210')).toBe(null)
  })
})

describe('dasType', () => {
  it('detects das_standard ZIP', () => {
    expect(dasType('10001')).toBe('standard')
  })
  it('detects das_extended ZIP', () => {
    expect(dasType('00130')).toBe('extended')
  })
  it('returns null for remote area ZIP', () => {
    expect(dasType('99540')).toBe(null)   // remote_alaska
    expect(dasType('96703')).toBe(null)   // remote_hawaii
  })
  it('returns null for ZIP not in surcharges file', () => {
    expect(dasType('77001')).toBe(null)  // Houston — not a DAS or remote ZIP
  })
})

describe('declaredValueCharge', () => {
  it('returns 0 when declaredValueDollars is 0', () => {
    expect(declaredValueCharge(0, 1.70, 5.11)).toBe(0)
  })
  it('applies minimum when declared value is low', () => {
    // $100 declared → $1.70, below minimum $5.11 → charge = $5.11
    expect(declaredValueCharge(100, 1.70, 5.11)).toBe(5.11)
  })
  it('applies rate when above minimum', () => {
    // $500 declared → $8.50, above minimum → charge = $8.50
    expect(declaredValueCharge(500, 1.70, 5.11)).toBeCloseTo(8.50, 2)
  })
})

describe('estimateUPS — DAS surcharge', () => {
  it('applies DAS standard commercial ground for 10001 ($4.50 list)', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dasSurchargeType).toBe('standard')
    expect(r.breakdown.dasSurcharge).toBe(4.50)
  })

  it('applies DAS standard residential rate when residential=true ($6.55 list)', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: true, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dasSurchargeType).toBe('standard')
    expect(r.breakdown.dasSurcharge).toBe(6.55)
  })

  it('applies DAS discount when contractDiscounts.das is set', () => {
    // 50% DAS discount on $4.50 → $2.25
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, contractDiscounts: { das: 0.50 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dasSurcharge).toBeCloseTo(2.25, 2)
  })

  it('no DAS for ZIP not in surcharges file', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '77001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dasSurchargeType).toBe(null)
    expect(r.breakdown.dasSurcharge).toBe(0)
  })

  it('DAS included in totalEstimatedCharge', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.totalEstimatedCharge).toBeCloseTo(
      b.netTransportationCharge + b.fuelSurcharge + b.dasSurcharge, 4,
    )
  })
})

describe('estimateUPS — remote area, declared value, address correction', () => {
  it('remote area Alaska surcharge auto-detected from dest ZIP 99540', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '99540', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.remoteAreaType).toBe('alaska')
    expect(r.breakdown.remoteAreaSurcharge).toBe(46.25)
    expect(r.breakdown.dasSurcharge).toBe(0)
  })

  it('remote area Hawaii surcharge auto-detected from dest ZIP 96703', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '96703', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.remoteAreaType).toBe('hawaii')
    expect(r.breakdown.remoteAreaSurcharge).toBe(16.50)
    expect(r.breakdown.dasSurcharge).toBe(0)
  })

  it('no remote area surcharge for continental ZIP', () => {
    // 77001 (Houston) has no entry in zip-surcharges — no DAS, no remote
    const r = estimateUPS({ weightLbs: 5, destinationZip: '77001', service: 'ground', residential: false, zoneChart: CHART_601 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.remoteAreaType).toBe(null)
    expect(r.breakdown.remoteAreaSurcharge).toBe(0)
    expect(r.breakdown.dasSurcharge).toBe(0)
  })

  it('declared value charge applied correctly', () => {
    // $500 declared → $8.50 list, no discount
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, declaredValueDollars: 500 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.declaredValueCharge).toBeCloseTo(8.50, 2)
  })

  it('declared value uses minimum when declared amount is small', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, declaredValueDollars: 100 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.declaredValueCharge).toBe(5.11)
  })

  it('address correction charge applied when flagged', () => {
    const r = estimateUPS({ weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false, zoneChart: CHART_601, addressCorrection: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.addressCorrectionCharge).toBe(25.25)
  })

  it('all three charges included in totalEstimatedCharge', () => {
    const r = estimateUPS({
      weightLbs: 5, destinationZip: '10001', service: 'ground', residential: false,
      zoneChart: CHART_601, declaredValueDollars: 500, addressCorrection: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.breakdown
    expect(b.totalEstimatedCharge).toBeCloseTo(
      b.netTransportationCharge + b.fuelSurcharge + b.residentialSurcharge +
      b.dasSurcharge + b.largePackageSurcharge + b.additionalHandlingSurcharge +
      b.remoteAreaSurcharge + b.declaredValueCharge + b.addressCorrectionCharge,
      4,
    )
  })
})
