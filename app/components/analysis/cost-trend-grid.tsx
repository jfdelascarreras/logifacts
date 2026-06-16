'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DailySpendPoint = {
  date: string
  totalCost: number
  costFuel: number
  costAccessorials: number
  costSurcharges: number
}

type MetricKey = 'totalCost' | 'costAccessorials' | 'costSurcharges' | 'costFuel'

const METRICS: Array<{ key: MetricKey; title: string; strokeVar: string; strokeWidth?: number }> = [
  { key: 'totalCost', title: 'Cost', strokeVar: 'var(--chart-1)', strokeWidth: 2.25 },
  { key: 'costAccessorials', title: 'Accessorials', strokeVar: 'var(--chart-2)', strokeWidth: 2.25 },
  // Slightly stronger style so this series is easier to read.
  { key: 'costSurcharges', title: 'Surcharges', strokeVar: 'var(--chart-3)', strokeWidth: 2.9 },
  { key: 'costFuel', title: 'Fuel Cost', strokeVar: 'var(--chart-4)', strokeWidth: 2.25 },
]

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function sumByDays(points: DailySpendPoint[], key: MetricKey, days: number): number {
  const slice = points.slice(-days)
  return slice.reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function previousByDays(points: DailySpendPoint[], key: MetricKey, days: number): number {
  const end = Math.max(0, points.length - days)
  const start = Math.max(0, end - days)
  const slice = points.slice(start, end)
  return slice.reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function sumByCurrentMonth(points: DailySpendPoint[], key: MetricKey): number {
  if (!points.length) return 0
  const latest = points[points.length - 1]?.date.slice(0, 7)
  return points
    .filter((row) => row.date.startsWith(latest))
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function sumByPreviousMonth(points: DailySpendPoint[], key: MetricKey): number {
  if (!points.length) return 0
  const latestDate = new Date(`${points[points.length - 1].date}T00:00:00Z`)
  const prevMonthDate = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - 1, 1))
  const prevPrefix = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`
  return points
    .filter((row) => row.date.startsWith(prevPrefix))
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function sumByYtd(points: DailySpendPoint[], key: MetricKey): number {
  if (!points.length) return 0
  const latestYear = points[points.length - 1]?.date.slice(0, 4)
  return points
    .filter((row) => row.date.startsWith(latestYear))
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function previousYtd(points: DailySpendPoint[], key: MetricKey): number {
  if (!points.length) return 0
  const latestYear = Number(points[points.length - 1]?.date.slice(0, 4))
  const prevYear = String(latestYear - 1)
  return points
    .filter((row) => row.date.startsWith(prevYear))
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

/** `YYYY-MM-DD` +/- days in UTC. */
function addDaysUTC(anchor: string, deltaDays: number): string {
  const y = Number(anchor.slice(0, 4))
  const m = Number(anchor.slice(5, 7)) - 1
  const d = Number(anchor.slice(8, 10))
  const dt = new Date(Date.UTC(y, m, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function sumKeyInInclusiveDateRange(
  points: DailySpendPoint[],
  key: MetricKey,
  startInclusive: string,
  endInclusive: string
): number {
  return points
    .filter((row) => row.date >= startInclusive && row.date <= endInclusive)
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

/** 7 UTC calendar days ending on anchor: [anchor-6, anchor]. */
function weekSumThroughAnchor(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const start = addDaysUTC(anchor, -6)
  return sumKeyInInclusiveDateRange(points, key, start, anchor)
}

/** Prior 7 UTC calendar days: [anchor-13, anchor-7]. */
function weekPrevSumForHoverAnchor(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const end = addDaysUTC(anchor, -7)
  const start = addDaysUTC(anchor, -13)
  return sumKeyInInclusiveDateRange(points, key, start, end)
}

/** Month containing anchor, only rows on/before anchor. */
function monthSumThroughAnchor(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const prefix = anchor.slice(0, 7)
  return points
    .filter((row) => row.date.startsWith(prefix) && row.date <= anchor)
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function previousMonthYyyyMm(anchor: string): string {
  const y = Number(anchor.slice(0, 4))
  const m = Number(anchor.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return anchor.slice(0, 7)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Full previous calendar month in dataset (for hover delta). */
function previousCalendarMonthSumForAnchor(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const prefix = previousMonthYyyyMm(anchor)
  return points
    .filter((row) => row.date.startsWith(prefix))
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function ytdSumThroughAnchor(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const year = anchor.slice(0, 4)
  return points
    .filter((row) => row.date.startsWith(year) && row.date <= anchor)
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** Prior-year YTD through same calendar month-day as anchor (Feb 29 clamps to Feb 28 if needed). */
function ytdPrevYearThroughSameCalendar(points: DailySpendPoint[], key: MetricKey, anchor: string): number {
  const year = Number(anchor.slice(0, 4))
  const prevYear = year - 1
  const mm = anchor.slice(5, 7)
  const dd = anchor.slice(8, 10)
  let endStr = `${prevYear}-${mm}-${dd}`
  if (mm === '02' && dd === '29' && !isLeapYear(prevYear)) {
    endStr = `${prevYear}-02-28`
  }
  const prefix = String(prevYear)
  return points
    .filter((row) => row.date.startsWith(prefix) && row.date <= endStr)
    .reduce((acc, row) => acc + (row[key] ?? 0), 0)
}

function deltaText(current: number, previous: number): string {
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  return `${sign}${formatCompact(diff)}`
}

type MonthAxisTick = { label: string; leftPct: number; monthKey: string }

function formatMonthYear(dateStr: string, showYear: boolean): string {
  const dt = new Date(`${dateStr}T00:00:00Z`)
  if (showYear) {
    return dt.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

/** One label per calendar month, centered on that month's span in the daily series. */
function buildMonthAxisTicks(dates: string[], maxLabels: number): MonthAxisTick[] {
  if (!dates.length) return []

  const monthSpans = new Map<string, { first: number; last: number }>()
  for (let i = 0; i < dates.length; i += 1) {
    const monthKey = dates[i]!.slice(0, 7)
    const span = monthSpans.get(monthKey)
    if (!span) monthSpans.set(monthKey, { first: i, last: i })
    else span.last = i
  }

  const monthKeys = [...monthSpans.keys()].sort()
  const years = new Set(monthKeys.map((k) => k.slice(0, 4)))
  const showYear = years.size > 1 || monthKeys.length <= 10

  const denom = Math.max(1, dates.length - 1)
  const raw: MonthAxisTick[] = monthKeys.map((monthKey) => {
    const span = monthSpans.get(monthKey)!
    const centerIdx = (span.first + span.last) / 2
    return {
      monthKey,
      label: formatMonthYear(`${monthKey}-01`, showYear),
      leftPct: (centerIdx / denom) * 100,
    }
  })

  return pickMonthTicksWithMinSpacing(raw, maxLabels, 9)
}

function pickMonthTicksWithMinSpacing(
  ticks: MonthAxisTick[],
  maxLabels: number,
  minSpacingPct: number
): MonthAxisTick[] {
  if (ticks.length <= 1) return ticks

  const tryAdd = (out: MonthAxisTick[], candidate: MonthAxisTick) => {
    if (out.some((t) => Math.abs(t.leftPct - candidate.leftPct) < minSpacingPct)) return
    out.push(candidate)
  }

  const picked: MonthAxisTick[] = []
  tryAdd(picked, ticks[0]!)
  tryAdd(picked, ticks[ticks.length - 1]!)

  if (ticks.length <= maxLabels) {
    for (const t of ticks.slice(1, -1)) tryAdd(picked, t)
    return picked.sort((a, b) => a.leftPct - b.leftPct)
  }

  const middle = ticks.slice(1, -1)
  const slots = Math.max(0, maxLabels - picked.length)
  const step = Math.max(1, Math.ceil(middle.length / Math.max(1, slots)))
  for (let i = 0; i < middle.length; i += step) tryAdd(picked, middle[i]!)

  return picked.sort((a, b) => a.leftPct - b.leftPct)
}

function monthTickLabelClass(leftPct: number, index: number, total: number): string {
  const base = 'absolute whitespace-nowrap'
  if (index === 0 && leftPct <= 8) return `${base} left-0`
  if (index === total - 1 && leftPct >= 92) return `${base} right-0`
  return `${base} -translate-x-1/2`
}

function monthTickLabelStyle(leftPct: number, index: number, total: number): CSSProperties {
  if (index === 0 && leftPct <= 8) return { left: 0 }
  if (index === total - 1 && leftPct >= 92) return { right: 0 }
  return { left: `${leftPct}%` }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function Sparkline({
  values,
  stroke,
  dates,
  metricTitle,
  strokeWidth = 2.25,
  onHoverIndexChange,
}: {
  values: number[]
  stroke: string
  dates: string[]
  metricTitle: string
  strokeWidth?: number
  /** Fired whenever the hovered chart index changes (including null when pointer leaves chart). */
  onHoverIndexChange?: (index: number | null) => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    onHoverIndexChange?.(hoveredIdx)
  }, [hoveredIdx, onHoverIndexChange])

  if (!values.length) return <div className="h-44 rounded-md border border-border bg-muted/20" />
  const width = 640
  const height = 220
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(1, max - min)
  const points = values.map((value, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * (width - 20) + 10
    const y = height - 14 - ((value - min) / spread) * (height - 28)
    return { x, y }
  })

  const smoothPath = points
    .map((point, idx, arr) => {
      if (idx === 0) return `M ${point.x} ${point.y}`
      const prev = arr[idx - 1]
      const midX = (prev.x + point.x) / 2
      return `Q ${midX} ${prev.y}, ${point.x} ${point.y}`
    })
    .join(' ')

  const monthTicks = buildMonthAxisTicks(dates, 7)

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null
  const hoveredDate = hoveredIdx !== null ? dates[hoveredIdx] : null
  const hoveredValue = hoveredIdx !== null ? values[hoveredIdx] ?? 0 : null

  return (
    <div className="space-y-1">
      <div aria-live="polite" className="min-h-[1.35rem] text-[11px] text-muted-foreground">
        {hoveredDate && hoveredValue !== null ? (
          <>
            {hoveredDate}:{' '}
            <span className="font-medium text-foreground">{formatCurrency(hoveredValue)}</span>
            <span className="text-muted-foreground"> ({metricTitle})</span>
          </>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {points.map((point, idx) => {
          const zoneWidth = idx === 0 ? 12 : Math.max(8, point.x - points[idx - 1].x)
          return (
            <rect
              key={`${dates[idx]}-${idx}`}
              x={point.x - zoneWidth / 2}
              y={0}
              width={zoneWidth}
              height={height}
              fill="transparent"
              tabIndex={-1}
              aria-label={`${metricTitle}, ${dates[idx]}, ${formatCurrency(values[idx] ?? 0)}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseMove={() => setHoveredIdx(idx)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx(null)}
            />
          )
        })}
        {hoveredPoint ? (
          <line
            x1={hoveredPoint.x}
            x2={hoveredPoint.x}
            y1={8}
            y2={height - 8}
            stroke={stroke}
            strokeOpacity="0.28"
            strokeWidth="1.25"
            strokeDasharray="3 3"
          />
        ) : null}
        <path
          d={smoothPath}
          fill="none"
          stroke={stroke}
          strokeOpacity="0.85"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoveredPoint ? (
          <>
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r={4.25}
              fill={stroke}
              stroke="var(--background)"
              strokeWidth={1.5}
            />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={8} fill={stroke} fillOpacity={0.15} />
          </>
        ) : null}
      </svg>
      <div className="relative mt-1 h-6 overflow-hidden px-0.5 text-[11px] leading-tight text-muted-foreground">
        {monthTicks.map((tick, i) => (
          <span
            key={tick.monthKey}
            className={monthTickLabelClass(tick.leftPct, i, monthTicks.length)}
            style={monthTickLabelStyle(tick.leftPct, i, monthTicks.length)}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function CostTrendMetricCard({
  metric,
  dailySpend,
}: {
  metric: (typeof METRICS)[number]
  dailySpend: DailySpendPoint[]
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const handleHoverIndexChange = useCallback((idx: number | null) => {
    setHoverIdx(idx)
  }, [])

  const dates = dailySpend.map((row) => row.date)
  const series = dailySpend.map((row) => row[metric.key] ?? 0)
  const total = series.reduce((a, b) => a + b, 0)

  const anchorDate = hoverIdx !== null ? dates[hoverIdx] ?? null : null

  let week: number
  let weekPrev: number
  let month: number
  let monthPrev: number
  let ytd: number
  let ytdPrev: number

  if (anchorDate !== null && anchorDate.length >= 10) {
    week = weekSumThroughAnchor(dailySpend, metric.key, anchorDate)
    weekPrev = weekPrevSumForHoverAnchor(dailySpend, metric.key, anchorDate)
    month = monthSumThroughAnchor(dailySpend, metric.key, anchorDate)
    monthPrev = previousCalendarMonthSumForAnchor(dailySpend, metric.key, anchorDate)
    ytd = ytdSumThroughAnchor(dailySpend, metric.key, anchorDate)
    ytdPrev = ytdPrevYearThroughSameCalendar(dailySpend, metric.key, anchorDate)
  } else {
    week = sumByDays(dailySpend, metric.key, 7)
    weekPrev = previousByDays(dailySpend, metric.key, 7)
    month = sumByCurrentMonth(dailySpend, metric.key)
    monthPrev = sumByPreviousMonth(dailySpend, metric.key)
    ytd = sumByYtd(dailySpend, metric.key)
    ytdPrev = previousYtd(dailySpend, metric.key)
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-foreground">
          {metric.title} | ${formatCompact(total)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">Week</div>
            <div>${formatCompact(week)}</div>
            <div>{deltaText(week, weekPrev)}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">Month</div>
            <div>${formatCompact(month)}</div>
            <div>{deltaText(month, monthPrev)}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">YTD</div>
            <div>${formatCompact(ytd)}</div>
            <div>{deltaText(ytd, ytdPrev)}</div>
          </div>
        </div>
        {anchorDate ? (
          <p className="text-[11px] text-muted-foreground">Rollups as of {anchorDate}</p>
        ) : null}
        <Sparkline
          values={series}
          stroke={metric.strokeVar}
          dates={dates}
          metricTitle={metric.title}
          strokeWidth={metric.strokeWidth}
          onHoverIndexChange={handleHoverIndexChange}
        />
      </CardContent>
    </Card>
  )
}

export function CostTrendGrid({ dailySpend }: { dailySpend: DailySpendPoint[] }) {
  if (!dailySpend.length) return null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {METRICS.map((metric) => (
        <CostTrendMetricCard key={metric.key} metric={metric} dailySpend={dailySpend} />
      ))}
    </div>
  )
}
