import { describe, expect, it } from 'vitest'

import { compareAnalysisRunRegression } from '@/lib/premium-analysis/analysis-regression'
import { detectStaleIngest } from '@/lib/premium-analysis/stale-ingest'
import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'

describe('detectStaleIngest', () => {
  it('flags FedEx when expected parser version is missing', () => {
    const alert = detectStaleIngest(['legacy'], ['FedEx'])
    expect(alert.needsReupload).toBe(true)
    expect(alert.reasons[0]).toMatch(/FedEx/i)
    expect(alert.reasons[0]).toMatch(FEDEX_PARSE_VERSION)
  })

  it('passes when FedEx parser version is present', () => {
    const alert = detectStaleIngest([FEDEX_PARSE_VERSION], ['FedEx'])
    expect(alert.needsReupload).toBe(false)
  })
})

describe('compareAnalysisRunRegression', () => {
  it('detects significant spend shift vs prior run', () => {
    const result = compareAnalysisRunRegression(
      { totalCost: 110_000, shipmentCount: 100, lineCount: 1000 },
      {
        total_cost: 100_000,
        shipment_count: 100,
        line_count: 1000,
        ingest_source: 'invoice_rows',
        created_at: '2025-01-01T00:00:00Z',
      }
    )
    expect(result?.significantChange).toBe(true)
    expect(result?.totalCostDeltaPct).toBeCloseTo(0.1)
    expect(result?.message).toMatch(/total spend/i)
  })

  it('returns null when prior run has no baseline metrics', () => {
    const result = compareAnalysisRunRegression(
      { totalCost: 100, shipmentCount: 10, lineCount: 50 },
      {
        total_cost: 0,
        shipment_count: 0,
        line_count: 0,
        ingest_source: null,
        created_at: '2025-01-01T00:00:00Z',
      }
    )
    expect(result).toBeNull()
  })
})
