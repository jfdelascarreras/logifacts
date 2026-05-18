'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InvoiceLine } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
}

interface MonthPoint {
  month: string
  total: number
}

export function MonthlyTrend({ lines }: Props) {
  const points = useMemo<MonthPoint[]>(() => {
    const monthly = new Map<string, number>()
    for (const l of lines) {
      if (!l.shipment_date) continue
      const month = l.shipment_date.slice(0, 7) // YYYY-MM
      monthly.set(month, (monthly.get(month) ?? 0) + l.charge_amount)
    }
    return Array.from(monthly.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [lines])

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Monthly Spend Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No dated data available</p>
        </CardContent>
      </Card>
    )
  }

  const maxVal = Math.max(...points.map((p) => p.total))
  const W = 600
  const H = 160
  const PAD = { top: 12, right: 12, bottom: 28, left: 60 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xStep = points.length > 1 ? chartW / (points.length - 1) : chartW
  const toY = (v: number) => PAD.top + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0)
  const toX = (i: number) => PAD.left + (points.length > 1 ? i * xStep : chartW / 2)

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.total)}`).join(' ')
  const areaD = `${pathD} L ${toX(points.length - 1)} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`

  const fmt = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toFixed(0)}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Monthly Spend Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monthly spend trend">
          {/* Y-axis labels */}
          {[0, 0.5, 1].map((frac) => {
            const val = maxVal * frac
            const y = toY(val)
            return (
              <g key={frac}>
                <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{fmt(val)}</text>
              </g>
            )
          })}

          {/* Area fill */}
          <path d={areaD} fill="#F0493E" fillOpacity={0.1} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#F0493E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* X-axis labels */}
          {points.map((p, i) => {
            const x = toX(i)
            const showLabel = points.length <= 12 || i % Math.ceil(points.length / 12) === 0
            return showLabel ? (
              <text key={p.month} x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {p.month.slice(0, 7)}
              </text>
            ) : null
          })}

          {/* Data points */}
          {points.map((p, i) => (
            <circle key={p.month} cx={toX(i)} cy={toY(p.total)} r={3} fill="#F0493E">
              <title>{p.month}: {fmt(p.total)}</title>
            </circle>
          ))}
        </svg>
      </CardContent>
    </Card>
  )
}
