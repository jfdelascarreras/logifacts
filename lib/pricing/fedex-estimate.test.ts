import { describe, expect, it } from 'vitest'

import { estimateFedEx } from './fedex-estimate'
import {
  additionalHandlingTrigger,
  dasType,
  declaredValueCharge,
  isOversize,
} from './fedex-accessorials'
import type { FedExZoneChart } from './fedex-types'

import chart601Json from './data/fedex-zone-charts/601.json'

const CHART_601 = chart601Json as unknown as FedExZoneChart

describe('estimateFedEx — input validation', () => {
  it('errors on weight = 0', () => {
    const r = estimateFedEx({
      weightLbs: 0,
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(false)
  })
})

describe('estimateFedEx — zone lookup', () => {
  it('resolves zone 5 for Chicago→NYC Ground', () => {
    const r = estimateFedEx({
      weightLbs: 5,
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.zone).toBe(5)
  })

  it('maps residential ground to home delivery', () => {
    const r = estimateFedEx({
      weightLbs: 5,
      destinationZip: '10001',
      service: 'ground',
      residential: true,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.service).toBe('home_delivery')
    expect(r.breakdown.homeDeliverySurcharge).toBeGreaterThan(0)
  })
})

describe('estimateFedEx — billable weight', () => {
  it('uses DIM divisor 139', () => {
    const r = estimateFedEx({
      weightLbs: 5,
      dimensionsIn: { length: 20, width: 15, height: 10 },
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.dimWeightLbs).toBe(22)
    expect(r.breakdown.billableWeightSource).toBe('dimensional')
  })
})

describe('estimateFedEx — published rate', () => {
  it('returns list rate for 1 lb zone 5 ground', () => {
    const r = estimateFedEx({
      weightLbs: 1,
      destinationZip: '10001',
      service: 'ground',
      residential: false,
      zoneChart: CHART_601,
      fuelSurchargeRates: { ground: 0, express: 0 },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.breakdown.publishedRate).toBe(14.0)
  })
})

describe('fedex-accessorials helpers', () => {
  it('detects oversize by length', () => {
    expect(isOversize({ length: 97, width: 10, height: 10 }, 10)).toBe(true)
  })

  it('detects DAS standard ZIP', () => {
    expect(dasType('85935')).toBe('standard')
  })

  it('calculates declared value with minimum band', () => {
    expect(declaredValueCharge(200, 300, 4.95, 1.65)).toBe(4.95)
    expect(declaredValueCharge(500, 300, 4.95, 1.65)).toBe(8.25)
  })

  it('weight AHS trigger above 50 lbs', () => {
    expect(additionalHandlingTrigger(51, undefined, false)).toBe('weight')
  })
})
