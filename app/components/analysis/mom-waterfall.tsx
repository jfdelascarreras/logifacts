'use client'

import { useEffect, useMemo, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildMomWaterfallSegments } from '@/lib/premium-analysis/mom-waterfall-segments'

type MonthRow = {
  month: string
  totalCost: number
  costFuel?: number
  costAccessorials?: number
  costSurcharges?: number
}

type Props = {
  monthlySpend: MonthRow[]
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

function fmtPct(delta: number, base: number): string {
  if (base === 0) return ''
  const pct = (delta / Math.abs(base)) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

export function MomWaterfall({ monthlySpend }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(1)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  // Reset to newest-vs-prior pair when data changes (e.g. after refresh or filter)
  useEffect(() => {
    setCurrentIdx(0)
    setPrevIdx(Math.min(1, monthlySpend.length - 1))
    setHoveredBar(null)
  }, [monthlySpend])

  const safeCurrentIdx = Math.min(currentIdx, monthlySpend.length - 1)
  const safePrevIdx = Math.min(prevIdx, monthlySpend.length - 1)

  const chart = useMemo(() => {
    if (monthlySpend.length < 2 || safeCurrentIdx === safePrevIdx) return null

    const current = monthlySpend[safeCurrentIdx]!
    const previous = monthlySpend[safePrevIdx]!

    const segments = buildMomWaterfallSegments(current, previous)

    let running = 0
    const bars = segments.map(s => {
      const start = running
      const end = running + s.delta
      running = end
      return { label: s.label, delta: s.delta, base: s.base, start, end }
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

    const totalDelta = current.totalCost - previous.totalCost
    const biggestBar = [...bars].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]!

    return {
      bars, toY, zero: toY(0), barW, bx, ticks,
      totalDelta,
      previousTotal: previous.totalCost,
      currentMonth: current.month,
      previousMonth: previous.month,
      biggestBar,
    }
  }, [monthlySpend, safeCurrentIdx, safePrevIdx])

  if (!chart || monthlySpend.length < 2) return null

  const { bars, toY, zero, barW, bx, ticks, totalDelta, previousTotal, currentMonth, previousMonth, biggestBar } = chart
  const totalSign = totalDelta >= 0 ? '+' : '−'
  const totalPctStr = fmtPct(totalDelta, previousTotal)
  const biggestSign = biggestBar.delta >= 0 ? '+' : '−'
  const biggestPct = fmtPct(biggestBar.delta, biggestBar.base)

  const descLine = [
    `${currentMonth} vs ${previousMonth}`,
    'Fuel is counted under surcharges in KPIs; waterfall shows fuel separately and other surcharges excl. fuel.',
    Math.abs(totalDelta) > 0
      ? `Biggest driver: ${biggestBar.label} (${biggestSign}${fmtAmt(Math.abs(biggestBar.delta))}${biggestPct ? `, ${biggestPct}` : ''})`
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card className="border-accent/25 bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              What Drove the {totalSign}{fmtAmt(Math.abs(totalDelta))}{totalPctStr ? ` (${totalPctStr})` : ''} MoM Change?
            </CardTitle>
            <CardDescription className="mt-1">{descLine}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              aria-label="Current month"
              className="h-7 rounded border border-input bg-background px-2 py-0 text-xs text-foreground shadow-sm"
              value={safeCurrentIdx}
              onChange={e => {
                const v = Number(e.target.value)
                setCurrentIdx(v)
                if (v === safePrevIdx) {
                  const fallback = v + 1 < monthlySpend.length ? v + 1 : Math.max(0, v - 1)
                  if (fallback !== v) setPrevIdx(fallback)
                }
              }}
            >
              {monthlySpend.map((row, i) => (
                <option key={i} value={i}>{row.month}</option>
              ))}
            </select>
            <span className="shrink-0 text-xs text-muted-foreground">vs</span>
            <select
              aria-label="Prior month"
              className="h-7 rounded border border-input bg-background px-2 py-0 text-xs text-foreground shadow-sm"
              value={safePrevIdx}
              onChange={e => {
                const v = Number(e.target.value)
                setPrevIdx(v)
                if (v === safeCurrentIdx) {
                  const fallback = v > 0 ? v - 1 : v + 1 < monthlySpend.length ? v + 1 : v
                  if (fallback !== v) setCurrentIdx(fallback)
                }
              }}
            >
              {monthlySpend.map((row, i) => (
                <option key={i} value={i}>{row.month}</option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          aria-label="Month-over-month cost waterfall chart"
          className="overflow-visible"
          onMouseLeave={() => setHoveredBar(null)}
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
            const isHovered = hoveredBar === i
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

                {/* Invisible wider hit zone for hover */}
                <rect
                  x={x - 4} y={MT}
                  width={barW + 8} height={CH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredBar(i)}
                />

                {/* Bar */}
                <rect x={x} y={yHigh} width={barW} height={h} fill={fill} fillOpacity={isHovered ? 1 : 0.82} rx={3} />

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

        {/* Hover detail row — shows exact $ + % for the bar under the cursor */}
        <div aria-live="polite" className="mt-1 min-h-[1.25rem] text-center text-xs text-muted-foreground">
          {hoveredBar !== null && bars[hoveredBar] ? (() => {
            const bar = bars[hoveredBar]!
            const pct = fmtPct(bar.delta, bar.base)
            return (
              <span>
                <span className="font-medium text-foreground">{bar.label}</span>
                {': '}
                <span className={bar.delta >= 0 ? 'text-red-500' : 'text-green-500'}>
                  {bar.delta >= 0 ? '+' : '−'}{fmtAmt(Math.abs(bar.delta))}{pct ? ` (${pct})` : ''}
                </span>
              </span>
            )
          })() : null}
        </div>
      </CardContent>
    </Card>
  )
}
