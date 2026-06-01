import { describe, expect, it } from 'vitest'

import { originZipToPrefix, resolveChartPrefix } from './zone-chart-prefix'

const PREFIXES = [5, 20, 100, 200, 300, 400, 500, 601, 606, 700, 750, 800, 850, 900, 941, 980]

describe('originZipToPrefix', () => {
  it('extracts the first three digits', () => {
    expect(originZipToPrefix('60669')).toBe(606)
    expect(originZipToPrefix('01001')).toBe(10)
  })
})

describe('resolveChartPrefix', () => {
  it('uses an exact origin prefix when available', () => {
    expect(resolveChartPrefix('60669', PREFIXES)).toBe('606')
  })

  it('falls back to the largest available prefix ≤ origin', () => {
    expect(resolveChartPrefix('60701', PREFIXES)).toBe('606')
    expect(resolveChartPrefix('99999', PREFIXES)).toBe('980')
  })

  it('returns null when no chart covers the origin', () => {
    expect(resolveChartPrefix('00001', [100, 200])).toBeNull()
  })
})
