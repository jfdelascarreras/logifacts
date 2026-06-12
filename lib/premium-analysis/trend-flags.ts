import { yearMonthKeyFromEngineMonthLabel } from '@/lib/premium-analysis/analysis-summary'

export function detectMonthlySpendSpikes(
  monthlySpend: Array<{ month: string; totalCost: number }>
): string[] {
  if (monthlySpend.length < 4) return []

  const sorted = [...monthlySpend]
    .map((m) => ({
      month: m.month,
      sortKey: yearMonthKeyFromEngineMonthLabel(m.month) ?? m.month,
      totalCost: m.totalCost,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const spikes: string[] = []
  for (let i = 2; i < sorted.length; i++) {
    const window = sorted.slice(i - 3, i)
    const avg = window.reduce((s, x) => s + x.totalCost, 0) / 3
    if (avg <= 0) continue
    const current = sorted[i]!
    if (current.totalCost > avg * 1.2) {
      spikes.push(current.month)
    }
  }
  return spikes
}
