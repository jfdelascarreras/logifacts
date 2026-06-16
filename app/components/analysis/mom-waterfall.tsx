'use client'

import { useEffect, useMemo, useState } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildMomWaterfallSegments } from '@/lib/premium-analysis/mom-waterfall-segments'
import { waterfallBucketTaxonomy } from '@/lib/premium-analysis/waterfall-bucket-taxonomy'

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
const ML = 70
const MR = 16
const MT = 28
const MB = 52
const CW = VW - ML - MR
const CH = VH - MT - MB

function fmtAmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

function fmtAmtFull(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
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
    const bars = segments.map((s) => {
      const start = running
      const end = running + s.delta
      running = end
      return {
        label: s.label,
        delta: s.delta,
        base: s.base,
        current: s.current,
        previous: s.previous,
        start,
        end,
      }
    })

    const allVals = [0, ...bars.flatMap((b) => [b.start, b.end])]
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
      bars,
      toY,
      zero: toY(0),
      barW,
      bx,
      ticks,
      totalDelta,
      previousTotal: previous.totalCost,
      currentMonth: current.month,
      previousMonth: previous.month,
      biggestBar,
    }
  }, [monthlySpend, safeCurrentIdx, safePrevIdx])

  if (!chart || monthlySpend.length < 2) return null

  const {
    bars,
    toY,
    zero,
    barW,
    bx,
    ticks,
    totalDelta,
    previousTotal,
    currentMonth,
    previousMonth,
    biggestBar,
  } = chart
  const totalSign = totalDelta >= 0 ? '+' : '−'
  const totalPctStr = fmtPct(totalDelta, previousTotal)
  const biggestSign = biggestBar.delta >= 0 ? '+' : '−'
  const biggestPct = fmtPct(biggestBar.delta, biggestBar.base)

  const descLine = [
    `${currentMonth} vs ${previousMonth}`,
    'Hover a bar for mapping taxonomy details (see docs/MAPPING_TAXONOMY_TREE.md).',
    Math.abs(totalDelta) > 0
      ? `Biggest driver: ${biggestBar.label} (${biggestSign}${fmtAmt(Math.abs(biggestBar.delta))}${biggestPct ? `, ${biggestPct}` : ''})`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const hovered = hoveredBar !== null ? bars[hoveredBar] : null
  const taxonomy = hovered ? waterfallBucketTaxonomy(hovered.label) : null

  return (
    <Card className="border-accent/25 bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              What Drove the {totalSign}
              {fmtAmt(Math.abs(totalDelta))}
              {totalPctStr ? ` (${totalPctStr})` : ''} MoM Change?
            </CardTitle>
            <CardDescription className="mt-1">{descLine}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              aria-label="Current month"
              className="h-7 rounded border border-input bg-background px-2 py-0 text-xs text-foreground shadow-sm"
              value={safeCurrentIdx}
              onChange={(e) => {
                const v = Number(e.target.value)
                setCurrentIdx(v)
                if (v === safePrevIdx) {
                  const fallback = v + 1 < monthlySpend.length ? v + 1 : Math.max(0, v - 1)
                  if (fallback !== v) setPrevIdx(fallback)
                }
              }}
            >
              {monthlySpend.map((row, i) => (
                <option key={i} value={i}>
                  {row.month}
                </option>
              ))}
            </select>
            <span className="shrink-0 text-xs text-muted-foreground">vs</span>
            <select
              aria-label="Prior month"
              className="h-7 rounded border border-input bg-background px-2 py-0 text-xs text-foreground shadow-sm"
              value={safePrevIdx}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPrevIdx(v)
                if (v === safeCurrentIdx) {
                  const fallback = v > 0 ? v - 1 : v + 1 < monthlySpend.length ? v + 1 : v
                  if (fallback !== v) setCurrentIdx(fallback)
                }
              }}
            >
              {monthlySpend.map((row, i) => (
                <option key={i} value={i}>
                  {row.month}
                </option>
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
          {ticks.map(({ val, y }) => (
            <g key={val}>
              <line
                x1={ML}
                y1={y}
                x2={ML + CW}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.07}
                strokeWidth={1}
              />
              <text
                x={ML - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="currentColor"
                opacity={0.45}
              >
                {fmtAmt(val)}
              </text>
            </g>
          ))}

          <line
            x1={ML}
            y1={zero}
            x2={ML + CW}
            y2={zero}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={1}
          />

          {bars.map((bar, i) => {
            const x = bx(i)
            const yHigh = toY(Math.max(bar.start, bar.end))
            const yLow = toY(Math.min(bar.start, bar.end))
            const h = Math.max(yLow - yHigh, 2)
            const isPositive = bar.delta >= 0
            const fill = isPositive ? '#ef4444' : '#22c55e'
            const isHovered = hoveredBar === i
            const labelY = isPositive ? yHigh - 7 : yLow + 13

            return (
              <g key={bar.label}>
                {i < bars.length - 1 && (
                  <line
                    x1={x + barW}
                    y1={toY(bar.end)}
                    x2={bx(i + 1)}
                    y2={toY(bar.end)}
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}

                <rect
                  x={x - 4}
                  y={MT}
                  width={barW + 8}
                  height={CH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredBar(i)}
                />

                <rect
                  x={x}
                  y={yHigh}
                  width={barW}
                  height={h}
                  fill={fill}
                  fillOpacity={isHovered ? 1 : 0.82}
                  rx={3}
                />

                <text
                  x={x + barW / 2}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="600"
                  fill={fill}
                >
                  {isPositive ? '+' : '−'}
                  {fmtAmt(Math.abs(bar.delta))}
                </text>

                <text
                  x={x + barW / 2}
                  y={MT + CH + 17}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  opacity={isHovered ? 0.9 : 0.55}
                  fontWeight={isHovered ? 600 : 400}
                >
                  {bar.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div aria-live="polite" className="mt-3 min-h-[5rem]">
          {hovered && taxonomy ? (
            <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                <p className="font-semibold text-foreground">{hovered.label}</p>
                <p className={hovered.delta >= 0 ? 'font-medium text-red-500' : 'font-medium text-green-500'}>
                  MoM {hovered.delta >= 0 ? '+' : '−'}
                  {fmtAmtFull(Math.abs(hovered.delta))}
                  {fmtPct(hovered.delta, hovered.base) ? ` (${fmtPct(hovered.delta, hovered.base)})` : ''}
                </p>
              </div>

              <p className="mt-2 text-muted-foreground">
                <span className="font-medium text-foreground">{currentMonth}:</span>{' '}
                {fmtAmtFull(hovered.current)}
                <span className="mx-2 text-border">·</span>
                <span className="font-medium text-foreground">{previousMonth}:</span>{' '}
                {fmtAmtFull(hovered.previous)}
              </p>

              <p className="mt-2 leading-relaxed text-muted-foreground">{taxonomy.summary}</p>

              <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Formula</dt>
                  <dd className="text-muted-foreground">{taxonomy.formula}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Category 3 rule</dt>
                  <dd className="text-muted-foreground">{taxonomy.category3Rule}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Category 1 (mapping)</dt>
                  <dd className="text-muted-foreground">{taxonomy.category1.join(' · ')}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Category 2 (charge types)</dt>
                  <dd className="text-muted-foreground">{taxonomy.category2.join(' · ')}</dd>
                </div>
              </dl>

              <p className="mt-2">
                <span className="font-medium text-foreground">Examples: </span>
                <span className="text-muted-foreground">{taxonomy.examples.join(' · ')}</span>
              </p>

              {taxonomy.kpiNote ? (
                <p className="mt-2 rounded-md border border-amber-200/60 bg-amber-50/50 px-2 py-1 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  {taxonomy.kpiNote}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Hover a bar to see mapping taxonomy for that bucket.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
