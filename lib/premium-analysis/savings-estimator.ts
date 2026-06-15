import type { AnomalyFlag, SavingsEstimate } from '@/lib/premium-analysis/agents-types'
import { yearMonthKeyFromEngineMonthLabel } from '@/lib/premium-analysis/analysis-summary'

const RECOVERY_RATE: Partial<Record<AnomalyFlag['type'], { low: number; high: number }>> = {
  fuel_over_eia: { low: 0.5, high: 1 },
  contract_discount_shortfall: { low: 0.5, high: 1 },
  address_correction: { low: 0.8, high: 1 },
  large_package: { low: 0.25, high: 0.75 },
  additional_handling: { low: 0.25, high: 0.5 },
  avoidable_expedited: { low: 0.3, high: 0.7 },
  declared_value: { low: 0.5, high: 1 },
  accessorial_rate_high: { low: 0.1, high: 0.25 },
  weight_gap_high: { low: 0.15, high: 0.35 },
  monthly_spend_spike: { low: 0, high: 0 },
}

function monthsInDataset(monthlySpend: Array<{ month: string }>): number {
  const keys = new Set<string>()
  for (const m of monthlySpend) {
    const k = yearMonthKeyFromEngineMonthLabel(m.month)
    if (k) keys.add(k)
  }
  return Math.max(1, keys.size)
}

/** Scale overlapping flag totals so summed period amounts do not exceed total spend. */
export function capFlagAmountsBySpend(
  flags: AnomalyFlag[],
  periodTotalSpend: number
): Map<string, number> {
  const byType = new Map<string, number>()
  for (const flag of flags) {
    byType.set(flag.type, (byType.get(flag.type) ?? 0) + flag.amount)
  }
  const rawSum = [...byType.values()].reduce((s, a) => s + a, 0)
  if (periodTotalSpend <= 0 || rawSum <= periodTotalSpend) return byType
  const scale = periodTotalSpend / rawSum
  return new Map([...byType.entries()].map(([t, a]) => [t, a * scale]))
}

export function estimateSavings(
  anomalyFlags: AnomalyFlag[],
  monthlySpend: Array<{ month: string; totalCost?: number }>,
  periodTotalSpend?: number
): SavingsEstimate {
  const months = monthsInDataset(monthlySpend)
  const periodSpend =
    periodTotalSpend ?? monthlySpend.reduce((s, m) => s + (m.totalCost ?? 0), 0)
  const byType = capFlagAmountsBySpend(anomalyFlags, periodSpend)

  let opportunities = [...byType.entries()].map(([type, periodAmount]) => {
    const rates = RECOVERY_RATE[type as AnomalyFlag['type']] ?? { low: 0.2, high: 0.5 }
    const annualized = (periodAmount / months) * 12
    return {
      type,
      periodAmount,
      annualizedLow: annualized * rates.low,
      annualizedHigh: annualized * rates.high,
    }
  })

  let low = opportunities.reduce((s, o) => s + o.annualizedLow, 0)
  let high = opportunities.reduce((s, o) => s + o.annualizedHigh, 0)

  const annualizedSpendCap = periodSpend > 0 ? (periodSpend / months) * 12 : 0

  if (annualizedSpendCap > 0 && high > annualizedSpendCap) {
    const scale = annualizedSpendCap / high
    opportunities = opportunities.map((o) => ({
      ...o,
      annualizedLow: o.annualizedLow * scale,
      annualizedHigh: o.annualizedHigh * scale,
    }))
    low *= scale
    high = annualizedSpendCap
  }

  return {
    low: +low.toFixed(2),
    high: +high.toFixed(2),
    annualizedBasisMonths: months,
    opportunities: opportunities.sort((a, b) => b.annualizedHigh - a.annualizedHigh),
  }
}
