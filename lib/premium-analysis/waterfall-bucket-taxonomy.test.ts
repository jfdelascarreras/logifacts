import { describe, expect, it } from 'vitest'

import { WATERFALL_BUCKET_TAXONOMY, waterfallBucketTaxonomy } from './waterfall-bucket-taxonomy'

describe('waterfall-bucket-taxonomy', () => {
  it('defines all four MoM waterfall buckets', () => {
    expect(Object.keys(WATERFALL_BUCKET_TAXONOMY)).toEqual([
      'Base Freight',
      'Fuel',
      'Other surcharges',
      'Accessorials',
    ])
  })

  it('resolves taxonomy by segment label', () => {
    const fuel = waterfallBucketTaxonomy('Fuel')
    expect(fuel?.category1).toContain('Fuel Surcharge')
    expect(fuel?.kpiNote).toMatch(/other surcharges excludes/i)
  })
})
