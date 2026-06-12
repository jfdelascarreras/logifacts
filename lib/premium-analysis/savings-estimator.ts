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

export function estimateSavings(
  anomalyFlags: AnomalyFlag[],
  monthlySpend: Array<{ month: string }>
): SavingsEstimate {
  const months = monthsInDataset(monthlySpend)
  const byType = new Map<string, number>()

  for (const flag of anomalyFlags) {
    byType.set(flag.type, (byType.get(flag.type) ?? 0) + flag.amount)
  }

  const opportunities = [...byType.entries()].map(([type, periodAmount]) => {
    const rates = RECOVERY_RATE[type as AnomalyFlag['type']] ?? { low: 0.2, high: 0.5 }
    const annualized = (periodAmount / months) * 12
    return {
      type,
      periodAmount,
      annualizedLow: annualized * rates.low,
      annualizedHigh: annualized * rates.high,
    }
  })

  const low = opportunities.reduce((s, o) => s + o.annualizedLow, 0)
  const high = opportunities.reduce((s, o) => s + o.annualizedHigh, 0)

  return {
    low: +low.toFixed(2),
    high: +high.toFixed(2),
    annualizedBasisMonths: months,
    opportunities: opportunities.sort((a, b) => b.annualizedHigh - a.annualizedHigh),
  }
}
