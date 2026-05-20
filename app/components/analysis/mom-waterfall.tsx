'use client'

import { useMemo } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type MonthRow = {
  month: string
  totalCost: number
  costFuel?: number
  costAccessorials?: number
  costSurcharges?: number
}

type Props = {
  monthlySpend: MonthRow[]
  filterYear: string
  filterMonths: number[]
}

// SVG layout constants
const VW = 560
const VH = 270
const ML = 70, MR = 16, MT = 28, MB = 52
const CW = VW - ML - MR
const CH = VH - MT - MB

function fmtAmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

function parseMonthLabel(label: string): { monthNum: number; year: number } {
  const [name, yr] = label.split(' ')
  return {
    monthNum: new Date(`${name} 1`).getMonth() + 1,
    year: parseInt(yr ?? '0', 10),
  }
}

export function MomWaterfall({ monthlySpend, filterYear, filterMonths }: Props) {
  const pair = useMemo(() => {
    if (monthlySpend.length < 2) return null

    const parsed = monthlySpend.map((row, idx) => ({
      ...parseMonthLabel(row.month),
      row,
      idx,
    }))

    let currentIdx = 0

    if (filterYear && filterMonths.length > 0) {
      const yr = parseInt(filterYear, 10)
      const maxMonth = Math.max(...filterMonths)
      const found = parsed.find(p => p.year === yr && p.monthNum === maxMonth)
      if (found) currentIdx = found.idx
    } else if (filterYear) {
      const yr = parseInt(filterYear, 10)
      const found = parsed.find(p => p.year === yr)
      if (found) currentIdx = found.idx
    }

    if (currentIdx + 1 >= monthlySpend.length) return null

    return {
      current: monthlySpend[currentIdx],
      previous: monthlySpend[currentIdx + 1],
    }
  }, [monthlySpend, filterYear, filterMonths])

  const chart = useMemo(() => {
    if (!pair) return null
    const { current, previous } = pair

    const bfC = current.totalCost - (current.costFuel ?? 0) - (current.costAccessorials ?? 0) - (current.costSurcharges ?? 0)
    const bfP = previous.totalCost - (previous.costFuel ?? 0) - (previous.costAccessorials ?? 0) - (previous.costSurcharges ?? 0)

    const segments = [
      { label: 'Base Freight', delta: bfC - bfP },
      { label: 'Fuel', delta: (current.costFuel ?? 0) - (previous.costFuel ?? 0) },
      { label: 'Surcharges', delta: (current.costSurcharges ?? 0) - (previous.costSurcharges ?? 0) },
      { label: 'Accessorials', delta: (current.costAccessorials ?? 0) - (previous.costAccessorials ?? 0) },
    ]

    let running = 0
    const bars = segments.map(s => {
      const start = running
      const end = running + s.delta
      running = end
      return { label: s.label, delta: s.delta, start, end }
    })

    const allVals = [0, ...bars.flatMap(b => [b.start, b.end])]
    const dataMin = Math.min(...allVals)
    const dataMax = Math.max(...allVals)
    const span = dataMax - dataMin || 1
    const pad = span * 0.2
    const yMin = dataMin - pad
    const yMax = dataMax + pad

    const toY = (v: number) => MT + ((yMax - v) / (yMax - yMin)) * CH
    const slotW = CW / bars.length
    const barW = slotW * 0.54
    const bx = (i: number) => ML + i * slotW + (slotW - barW) / 2

    const tickCount = 5
    const ticks = Array.from({ length: tickCount }, (_, i) => ({
      val: yMin + (i / (tickCount - 1)) * (yMax - yMin),
      y: MT + (1 - i / (tickCount - 1)) * CH,
    }))

    return {
      bars, toY, zero: toY(0), barW, bx, ticks,
      totalDelta: current.totalCost - previous.totalCost,
      currentMonth: current.month,
      previousMonth: previous.month,
    }
  }, [pair])

  if (!chart) return null

  const { bars, toY, zero, barW, bx, ticks, totalDelta, currentMonth, previousMonth } = chart
  const sign = totalDelta >= 0 ? '+' : '−'

  return (
    <Card className="border-accent/25 bg-card">
      <CardHeader>
        <CardTitle>
          What Drove the {sign}{fmtAmt(Math.abs(totalDelta))} MoM Change?
        </CardTitle>
        <CardDescription>{currentMonth} vs {previousMonth}</CardDescription>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          aria-label="Month-over-month cost waterfall chart"
          className="overflow-visible"
        >
          {/* Gridlines + Y-axis labels */}
          {ticks.map(({ val, y }) => (
            <g key={val}>
              <line
                x1={ML} y1={y} x2={ML + CW} y2={y}
                stroke="currentColor" strokeOpacity={0.07} strokeWidth={1}
              />
              <text
                x={ML - 6} y={y}
                textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="currentColor" opacity={0.45}
              >
                {fmtAmt(val)}
              </text>
            </g>
          ))}

          {/* Zero reference line */}
          <line
            x1={ML} y1={zero} x2={ML + CW} y2={zero}
            stroke="currentColor" strokeOpacity={0.25} strokeWidth={1}
          />

          {/* Bars + connectors + labels */}
          {bars.map((bar, i) => {
            const x = bx(i)
            const yHigh = toY(Math.max(bar.start, bar.end))
            const yLow  = toY(Math.min(bar.start, bar.end))
            const h = Math.max(yLow - yHigh, 2)
            const isPositive = bar.delta >= 0
            // red = cost went up (bad), green = cost went down (good)
            const fill = isPositive ? '#ef4444' : '#22c55e'
            const labelY = isPositive ? yHigh - 7 : yLow + 13

            return (
              <g key={bar.label}>
                {/* Connector to next bar */}
                {i < bars.length - 1 && (
                  <line
                    x1={x + barW} y1={toY(bar.end)}
                    x2={bx(i + 1)} y2={toY(bar.end)}
                    stroke="currentColor" strokeOpacity={0.2}
                    strokeWidth={1} strokeDasharray="3 3"
                  />
                )}

                {/* Bar */}
                <rect x={x} y={yHigh} width={barW} height={h} fill={fill} fillOpacity={0.82} rx={3} />

                {/* Delta label */}
                <text
                  x={x + barW / 2} y={labelY}
                  textAnchor="middle" fontSize={10} fontWeight="600" fill={fill}
                >
                  {isPositive ? '+' : '−'}{fmtAmt(Math.abs(bar.delta))}
                </text>

                {/* Category label */}
                <text
                  x={x + barW / 2} y={MT + CH + 17}
                  textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55}
                >
                  {bar.label}
                </text>
              </g>
            )
          })}
        </svg>
      </CardContent>
    </Card>
  )
}
