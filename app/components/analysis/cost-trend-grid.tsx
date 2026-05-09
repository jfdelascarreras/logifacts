'use client'

import { useState } from 'react'

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

function deltaText(current: number, previous: number): string {
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  return `${sign}${formatCompact(diff)}`
}

function formatMonthYear(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00Z`)
  return dt.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
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
}: {
  values: number[]
  stroke: string
  dates: string[]
  metricTitle: string
  strokeWidth?: number
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
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

  const monthTickByLabel = new Map<string, number>()
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i]
    const monthKey = date.slice(0, 7)
    if (!monthTickByLabel.has(monthKey)) {
      monthTickByLabel.set(monthKey, i)
    }
  }
  const monthTicksRaw = Array.from(monthTickByLabel.entries()).map(([monthKey, idx]) => ({
    label: formatMonthYear(`${monthKey}-01`),
    idx,
    leftPct: (idx / Math.max(1, dates.length - 1)) * 100,
  }))
  let monthTicks = monthTicksRaw
  if (monthTicksRaw.length > 1) {
    // Keep labels spaced so they don't overlap visually.
    const maxLabels = 7
    const step = Math.max(1, Math.ceil(monthTicksRaw.length / maxLabels))
    monthTicks = monthTicksRaw.filter((_, i) => i % step === 0 || i === monthTicksRaw.length - 1)
  }

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null
  const hoveredDate = hoveredIdx !== null ? dates[hoveredIdx] : null
  const hoveredValue = hoveredIdx !== null ? values[hoveredIdx] ?? 0 : null

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
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
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseMove={() => setHoveredIdx(idx)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx(null)}
              onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
            >
              <title>{`${metricTitle}\n${dates[idx]}: ${formatCurrency(values[idx] ?? 0)}`}</title>
            </rect>
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
      {hoveredDate && hoveredValue !== null ? (
        <div className="text-[11px] text-muted-foreground">
          {hoveredDate}: <span className="font-medium text-foreground">{formatCurrency(hoveredValue)}</span>
        </div>
      ) : null}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {monthTicks.map((tick) => (
          <span
            key={`${tick.label}-${tick.idx}-${tick.leftPct.toFixed(2)}`}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${tick.leftPct}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function CostTrendGrid({ dailySpend }: { dailySpend: DailySpendPoint[] }) {
  if (!dailySpend.length) return null
  const dates = dailySpend.map((row) => row.date)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {METRICS.map((metric) => {
        const series = dailySpend.map((row) => row[metric.key] ?? 0)
        const total = series.reduce((a, b) => a + b, 0)
        const week = sumByDays(dailySpend, metric.key, 7)
        const weekPrev = previousByDays(dailySpend, metric.key, 7)
        const month = sumByCurrentMonth(dailySpend, metric.key)
        const monthPrev = sumByPreviousMonth(dailySpend, metric.key)
        const ytd = sumByYtd(dailySpend, metric.key)
        const ytdPrev = previousYtd(dailySpend, metric.key)

        return (
          <Card key={metric.key} className="border-border bg-card">
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
              <Sparkline
                values={series}
                stroke={metric.strokeVar}
                dates={dates}
                metricTitle={metric.title}
                strokeWidth={metric.strokeWidth}
              />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
