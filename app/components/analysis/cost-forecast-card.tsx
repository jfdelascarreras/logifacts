'use client'

import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FuelForecastResult, ScenarioForecastPoint } from '@/lib/invoices/forecasting'
import type { FuelSurchargeType } from '@/lib/pricing/ups-fuel-surcharge-history'

type MonthRow = {
  month: string
  totalCost: number
  costFuel?: number
}

type Props = {
  monthlySpend: MonthRow[]
  isFiltered?: boolean
}

const SURCHARGE_LABELS: Record<FuelSurchargeType, string> = {
  all:                    'All Fuel Surcharges',
  domesticGround:         'Domestic Ground',
  domesticAir:            'Domestic Air',
  intlAirExport:          'Intl Air Export',
  intlAirImport:          'Intl Air Import',
  intlGroundExportImport: 'Intl Ground',
}

const MODEL_LABELS: Record<string, string> = {
  mean:           'Mean',
  last_value:     'Last Value',
  seasonal_naive: 'Seasonal Naïve',
}

const WARNING_LABELS: Record<string, string> = {
  filtered_data:            'Based on filtered data',
  seasonality_not_reliable: 'Seasonality not reliable (< 12 months)',
  gaps_filled:              'Missing months filled with $0',
  small_training_set:       'Small training set — accuracy may be limited',
  using_stored_analysis:    'Using last saved analysis',
}

// SVG layout constants (matches mom-waterfall.tsx convention)
const VW = 560
const VH = 220
const ML = 64, MR = 16, MT = 16, MB = 40
const CW = VW - ML - MR
const CH = VH - MT - MB

function fmtAmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

function shortMonth(period: string): string {
  const [y, m] = period.split('-')
  if (!y || !m) return period
  const d = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1))
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

type ChartPoint = { period: string; totalCost: number; fuelCost: number; isForecast: boolean }

function buildChartPoints(
  history: FuelForecastResult['history'],
  forecast: ScenarioForecastPoint[]
): ChartPoint[] {
  const hist = history.map((h) => ({
    period: h.period,
    totalCost: h.totalCost,
    fuelCost: h.fuelCost,
    isForecast: false,
  }))
  const fc = forecast.map((f) => ({
    period: f.period,
    totalCost: f.totalCost,
    fuelCost: f.fuelCost,
    isForecast: true,
  }))
  return [...hist, ...fc]
}

function buildSmoothPath(points: { x: number; y: number }[], tension = 0.35): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  if (points.length === 2)
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`

  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? points[i + 1]!
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export function CostForecastCard({ monthlySpend, isFiltered }: Props) {
  const [result, setResult] = useState<FuelForecastResult | null>(null)
  const [scenarios, setScenarios] = useState<{ low: number; current: number; high: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeScenario, setActiveScenario] = useState<'low' | 'current' | 'high' | 'custom'>('current')
  const [customRate, setCustomRate] = useState('')
  const [surchargeType, setSurchargeType] = useState<FuelSurchargeType>('all')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effectiveRate: number | null = (() => {
    if (!scenarios) return null
    if (activeScenario === 'custom') {
      const v = parseFloat(customRate)
      return isNaN(v) || v <= 0 || v > 100 ? null : v / 100
    }
    return scenarios[activeScenario]
  })()

  function fetch(customRateOverride?: number) {
    setLoading(true)
    setError(null)
    const body: Record<string, unknown> = {
      monthlySpend,
      surchargeType,
      isFiltered: isFiltered ?? false,
    }
    if (customRateOverride !== undefined) body.customRate = customRateOverride

    globalThis.fetch('/api/invoices/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (data.error) {
          setError(data.error as string)
        } else {
          setResult(data as unknown as FuelForecastResult)
          setScenarios(data.scenarioRates as { low: number; current: number; high: number })
        }
      })
      .catch(() => setError('Failed to load forecast.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (monthlySpend.length >= 6) fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlySpend, surchargeType])

  function handleCustomRateChange(val: string) {
    setCustomRate(val)
    setActiveScenario('custom')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const v = parseFloat(val)
      if (!isNaN(v) && v > 0 && v <= 100) fetch(v / 100)
    }, 400)
  }

  if (monthlySpend.length < 6) {
    return (
      <Card className="border-accent/25 bg-card">
        <CardHeader>
          <CardTitle>Spend Forecast</CardTitle>
          <CardDescription>Next 3 months projection</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Need at least 6 months of invoice history to generate a forecast.
          </p>
        </CardContent>
      </Card>
    )
  }

  const activeForecast =
    result && effectiveRate !== null
      ? activeScenario === 'custom'
        ? result.scenarios.current.forecast.map((p) => ({
            ...p,
            fuelCost: p.baseFreight * effectiveRate,
            totalCost: p.baseFreight * (1 + effectiveRate),
          }))
        : result.scenarios[activeScenario as 'low' | 'current' | 'high'].forecast
      : result?.scenarios.current.forecast ?? []

  const allPoints = result ? buildChartPoints(result.history, activeForecast) : []

  // Scale
  const allTotalCosts = allPoints.map((p) => p.totalCost)
  const yMax = Math.max(...allTotalCosts, 1) * 1.15
  const yMin = 0
  const toX = (i: number) => ML + (i / Math.max(allPoints.length - 1, 1)) * CW
  const toY = (v: number) => MT + ((yMax - v) / (yMax - yMin)) * CH

  const histPoints   = allPoints.filter((p) => !p.isForecast)
  const fcPoints     = allPoints.filter((p) => p.isForecast)
  const joinPoint    = histPoints[histPoints.length - 1]
  const joinPointIdx = allPoints.findIndex((p) => p === joinPoint)
  const fcStartPoint = joinPoint
    ? { x: toX(joinPointIdx), y: toY(joinPoint.totalCost) }
    : null

  const histTotalPath = buildSmoothPath(histPoints.map((p, i) => ({ x: toX(i), y: toY(p.totalCost) })))
  const histFuelPath  = buildSmoothPath(histPoints.map((p, i) => ({ x: toX(i), y: toY(p.fuelCost) })))
  const fcTotalPath   = fcStartPoint
    ? buildSmoothPath([
        fcStartPoint,
        ...fcPoints.map((p, i) => ({ x: toX(joinPointIdx + 1 + i), y: toY(p.totalCost) })),
      ])
    : ''
  const fcFuelPath    = fcStartPoint
    ? buildSmoothPath([
        { x: fcStartPoint.x, y: toY(joinPoint!.fuelCost) },
        ...fcPoints.map((p, i) => ({ x: toX(joinPointIdx + 1 + i), y: toY(p.fuelCost) })),
      ])
    : ''

  const tickCount = 5
  const ticks = Array.from({ length: tickCount }, (_, i) => ({
    val: yMin + ((tickCount - 1 - i) / (tickCount - 1)) * (yMax - yMin),
    y: MT + (i / (tickCount - 1)) * CH,
  }))

  // X-axis labels: evenly pick up to 8
  const maxLabels = 8
  const step = Math.max(1, Math.ceil(allPoints.length / maxLabels))
  const xLabels = allPoints
    .map((p, i) => ({ period: p.period, x: toX(i), i }))
    .filter((_, i) => i === 0 || i === allPoints.length - 1 || i % step === 0)

  const mapeDisplay =
    result?.metrics.mape !== null && result?.metrics.mape !== undefined
      ? `${(result.metrics.mape * 100).toFixed(1)}%`
      : null

  return (
    <Card className="border-accent/25 bg-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Spend Forecast — next 3 months</CardTitle>
            <CardDescription>Base freight trend + fuel surcharge scenarios</CardDescription>
          </div>
          <select
            value={surchargeType}
            onChange={(e) => setSurchargeType(e.target.value as FuelSurchargeType)}
            className="text-xs border rounded px-2 py-1 bg-background text-foreground"
          >
            {(Object.keys(SURCHARGE_LABELS) as FuelSurchargeType[]).map((t) => (
              <option key={t} value={t}>{SURCHARGE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent>
        {/* Scenario selector */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Fuel scenario:</span>
          {(['low', 'current', 'high'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveScenario(s)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeScenario === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'low' ? 'Low' : s === 'current' ? 'Current' : 'High'}
              {scenarios ? ` ${(scenarios[s] * 100).toFixed(1)}%` : ''}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="Custom %"
              value={customRate}
              onChange={(e) => handleCustomRateChange(e.target.value)}
              className={`w-24 px-2 py-1 text-xs border rounded bg-background text-foreground ${
                activeScenario === 'custom' ? 'border-primary' : 'border-border'
              }`}
            />
          </div>
        </div>

        {/* Hover tooltip row */}
        <div aria-live="polite" className="min-h-[1.25rem] mb-1 text-xs text-muted-foreground">
          {hoveredIdx !== null && allPoints[hoveredIdx] ? (() => {
            const p = allPoints[hoveredIdx]!
            return (
              <span>
                <span className="font-medium text-foreground">
                  {shortMonth(p.period)} {p.period.slice(0, 4)}
                </span>
                {p.isForecast && <span className="ml-1 opacity-60">(forecast)</span>}
                {' · '}
                <span style={{ color: 'var(--chart-1)' }}>Total {fmtAmt(p.totalCost)}</span>
                {' · '}
                <span style={{ color: 'var(--chart-2)' }}>Fuel {fmtAmt(p.fuelCost)}</span>
              </span>
            )
          })() : null}
        </div>

        {/* Chart */}
        {loading && (
          <div className="h-[220px] flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Loading forecast…</span>
          </div>
        )}
        {error && !loading && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && result && allPoints.length > 0 && (
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            width="100%"
            aria-label="Spend forecast chart"
            className="overflow-visible"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Gridlines + Y labels */}
            {ticks.map(({ val, y }) => (
              <g key={val}>
                <line x1={ML} y1={y} x2={ML + CW} y2={y}
                  stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} />
                <text x={ML - 6} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="currentColor" opacity={0.45}>
                  {fmtAmt(val)}
                </text>
              </g>
            ))}

            {/* Vertical separator at history/forecast join */}
            {fcStartPoint && (
              <line
                x1={fcStartPoint.x} y1={MT}
                x2={fcStartPoint.x} y2={MT + CH}
                stroke="currentColor" strokeOpacity={0.2}
                strokeWidth={1} strokeDasharray="4 3"
              />
            )}

            {/* History lines */}
            {histTotalPath && (
              <path d={histTotalPath} fill="none"
                stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {histFuelPath && (
              <path d={histFuelPath} fill="none"
                stroke="var(--chart-2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Forecast lines (dashed) */}
            {fcTotalPath && (
              <path d={fcTotalPath} fill="none"
                stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 4"
                opacity={0.7} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {fcFuelPath && (
              <path d={fcFuelPath} fill="none"
                stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4"
                opacity={0.7} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Connector dot at join */}
            {fcStartPoint && (
              <circle cx={fcStartPoint.x} cy={fcStartPoint.y} r={3}
                fill="var(--chart-1)" opacity={0.8} />
            )}

            {/* X-axis labels */}
            {xLabels.map(({ period, x, i }) => {
              const isFirst = i === 0
              const isLast = i === xLabels.length - 1
              return (
                <text
                  key={i}
                  x={x}
                  y={MT + CH + 14}
                  textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.5}
                >
                  {shortMonth(period)}
                  {period.length >= 4 && xLabels.length <= 12 ? ` '${period.slice(2, 4)}` : ''}
                </text>
              )
            })}

            {/* Hover crosshair + dots */}
            {hoveredIdx !== null && allPoints[hoveredIdx] && (() => {
              const p = allPoints[hoveredIdx]!
              const x = toX(hoveredIdx)
              return (
                <>
                  <line x1={x} y1={MT} x2={x} y2={MT + CH}
                    stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
                  <circle cx={x} cy={toY(p.totalCost)} r={8} fill="var(--chart-1)" fillOpacity={0.12} />
                  <circle cx={x} cy={toY(p.totalCost)} r={4}
                    fill="var(--chart-1)" stroke="var(--background)" strokeWidth={1.5} />
                  <circle cx={x} cy={toY(p.fuelCost)} r={8} fill="var(--chart-2)" fillOpacity={0.12} />
                  <circle cx={x} cy={toY(p.fuelCost)} r={4}
                    fill="var(--chart-2)" stroke="var(--background)" strokeWidth={1.5} />
                </>
              )
            })()}

            {/* Hit zones — transparent rects on top to catch mouse events */}
            {allPoints.map((_, i) => {
              const x = toX(i)
              const prevX = i > 0 ? toX(i - 1) : x
              const nextX = i < allPoints.length - 1 ? toX(i + 1) : x
              const zoneLeft  = i === 0 ? ML : (x + prevX) / 2
              const zoneRight = i === allPoints.length - 1 ? ML + CW : (x + nextX) / 2
              return (
                <rect
                  key={i}
                  x={zoneLeft}
                  y={MT}
                  width={Math.max(1, zoneRight - zoneLeft)}
                  height={CH}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseMove={() => setHoveredIdx(i)}
                />
              )
            })}
          </svg>
        )}

        {/* Legend */}
        {!loading && !error && result && (
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-6 h-0.5 bg-[var(--chart-1)]" /> Total Cost
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-6 h-0.5 bg-[var(--chart-2)]" /> Fuel Cost
            </span>
            <span className="opacity-50">╌ forecast</span>
          </div>
        )}

        {/* Badges + warnings */}
        {!loading && result && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {result.model && (
              <Badge variant="secondary">{MODEL_LABELS[result.model] ?? result.model}</Badge>
            )}
            {mapeDisplay && (
              <Badge variant="outline">Hold-out MAPE {mapeDisplay}</Badge>
            )}
            {result.warnings
              .filter((w) => w in WARNING_LABELS)
              .map((w) => (
                <span key={w} className="text-xs text-muted-foreground">
                  ⚠ {WARNING_LABELS[w]}
                </span>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
