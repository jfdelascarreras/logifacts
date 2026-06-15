import { describe, expect, it } from 'vitest'

import { buildAnalysisRunRow } from '@/lib/premium-analysis/analysis-runs'
import { marginalAvoidablePremium } from '@/lib/premium-analysis/expedited-marginal'
import { fedexGroundTransitDays } from '@/lib/premium-analysis/fedex-transit-table'
import { groundTransitDaysForZone, isAvoidableExpedited } from '@/lib/premium-analysis/transit-table'

describe('fedex-transit-table', () => {
  it('returns ground transit for domestic zones', () => {
    expect(fedexGroundTransitDays(3)).toBe(2)
    expect(fedexGroundTransitDays(0)).toBeNull()
  })
})

describe('transit-table — carrier-aware', () => {
  it('uses FedEx transit for FedEx carrier', () => {
    expect(groundTransitDaysForZone(3, 'FedEx')).toBe(2)
    expect(isAvoidableExpedited(3, 'FedEx Priority Overnight', 'FedEx')).toBe(true)
  })
})

describe('marginalAvoidablePremium', () => {
  it('returns less than base freight for zone 3 Priority Overnight', () => {
    const marginal = marginalAvoidablePremium({
      carrier: 'FedEx',
      service: 'FedEx Priority Overnight',
      zone: 3,
      weightLbs: 5,
      baseFreightNet: 80,
    })
    expect(marginal).not.toBeNull()
    expect(marginal!).toBeGreaterThan(0)
    expect(marginal!).toBeLessThan(80)
  })

  it('returns null for non-FedEx carriers', () => {
    expect(
      marginalAvoidablePremium({
        carrier: 'UPS',
        service: 'UPS Next Day Air',
        zone: 3,
        weightLbs: 5,
        baseFreightNet: 80,
      })
    ).toBeNull()
  })
})

describe('buildAnalysisRunRow', () => {
  it('maps summary fields to audit row', () => {
    const row = buildAnalysisRunRow(
      'user-1',
      {
        totalRows: 100,
        measures: {
          totalCost: 50_000,
          packageDedupeShipmentCount: 40,
        } as import('@/lib/premium-analysis/analysis-summary').InvoiceAnalysisSummary['measures'],
        savingsEstimate: { low: 1, high: 5000, annualizedBasisMonths: 6, opportunities: [] },
        ingestSource: 'invoice_rows',
        ingestQuality: {
          blockSavings: false,
          unmappedPctOfSpend: 0.12,
          thresholdPct: 0.15,
          reason: null,
        },
      },
      1200
    )
    expect(row.user_id).toBe('user-1')
    expect(row.total_cost).toBe(50_000)
    expect(row.line_count).toBe(100)
    expect(row.shipment_count).toBe(40)
    expect(row.savings_high).toBe(5000)
    expect(row.ingest_source).toBe('invoice_rows')
    expect(row.duration_ms).toBe(1200)
  })
})
