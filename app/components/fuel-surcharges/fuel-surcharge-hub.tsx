'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CarrierLogo } from '@/app/components/pricing/carrier-logo'
import { cn } from '@/lib/utils'
import type { FuelRateObservation } from '@/lib/pricing/ups-fuel-surcharge-history'
import type { EiaObservation } from '@/lib/fuel-surcharges/eia'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FedExFuelObs = { effectiveDate: string; ground: number; express: number }

type HistoryPayload = {
  current: { ground: number; air: number; source: string } | null
  fedexCurrent: { ground: number; express: number; source: string } | null
  ups: FuelRateObservation[]
  fedex: FedExFuelObs[]
  eia: EiaObservation[]
  eiaError: 'rate_limited' | 'api_error' | 'network_error' | null
  weekOverWeekDelta: { ground: number; air: number } | null
  fedexWoWDelta: { ground: number; express: number } | null
  fiftyTwoWeekGroundHigh: number | null
  fiftyTwoWeekGroundLow: number | null
}

type CombinedRow = {
  week: string
  eia: number | null
  upsGround: number | null
  upsAir: number | null
  fedexGround: number | null
  fedexExpress: number | null
}

type Contract = {
  discountPct: number
  weeklySpend: number
}

type InvoiceFuelRow = {
  week: string; carrier: string; billed_fuel: number
  billed_transport: number | null; implied_rate: number | null
  published_rate: number | null; variance_dollars: number | null
  flag: 'overbilled' | 'underbilled' | 'correct' | 'no_transport' | 'no_rate'
}
type InvoiceFuelSummary = {
  total_fuel_billed: number; total_transport_billed: number
  weeks_analyzed: number; weeks_overbilled: number
  total_overbilled_dollars: number; avg_implied_rate: number | null
  carriers: string[]; date_range: { from: string; to: string } | null
}

type RerateRow = { tracking_number: string; ship_date: string; service: string; transport_charge: number; billed_fuel_surcharge: number }
type RerateResult = RerateRow & { rate_used: number | null; expected_fuel: number | null; variance: number | null; flag: 'overbilled' | 'underbilled' | 'correct' | 'no_rate' }
type RerateSummary = { total_rows: number; total_billed_fuel: number; total_expected_fuel: number; total_variance: number; flagged_overbilled: number; flagged_underbilled: number; no_rate_count: number; overbill_rate_pct: number }

type Tab = 'live' | 'rerate' | 'contract'
type RangeWeeks = 13 | 26 | 52 | 0

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CARRIER_COLORS = {
  ups: '#C9941A',
  fedex: '#4D148C',
  eiaD: '#3B82F6',
  eiaJ: '#6366F1',
  ontrac: '#CC0000',
  speedee: '#10B981',
}

const CONTRACT_KEY = 'logifacts:fuelContractV2'

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const fmtPct = (v: number | null) => v == null ? '—' : (v * 100).toFixed(2) + '%'
const fmtDelta = (v: number | null) => {
  if (v == null || v === 0) return null
  const sign = v > 0 ? '+' : ''
  return sign + (v * 100).toFixed(2) + 'pp'
}
const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const fmtUSDK = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v)

// ─────────────────────────────────────────────────────────────────────────────
// Merge UPS + FedEx + EIA into a single timeline
// ─────────────────────────────────────────────────────────────────────────────

function buildCombined(ups: FuelRateObservation[], fedex: FedExFuelObs[], eia: EiaObservation[]): CombinedRow[] {
  const map = new Map<string, CombinedRow>()
  const get = (w: string) => map.get(w) ?? map.set(w, { week: w, eia: null, upsGround: null, upsAir: null, fedexGround: null, fedexExpress: null }).get(w)!

  for (const r of ups) {
    const row = get(r.effectiveDate)
    row.upsGround = +(r.domesticGround * 100).toFixed(2)
    row.upsAir = +(r.domesticAir * 100).toFixed(2)
  }
  for (const r of fedex) {
    const row = get(r.effectiveDate)
    row.fedexGround = +(r.ground * 100).toFixed(2)
    row.fedexExpress = +(r.express * 100).toFixed(2)
  }
  for (const r of eia) {
    const row = get(r.period)
    row.eia = r.value
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week))
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Line Chart (with Y-axis, gridlines, fill)
// ─────────────────────────────────────────────────────────────────────────────

type ChartLine = {
  data: Array<number | null>
  color: string
  label: string
  dashed?: boolean
  fill?: boolean
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  const valid = points.filter(p => p.y !== -9999)
  if (valid.length < 2) return ''
  let d = `M ${valid[0]!.x} ${valid[0]!.y}`
  for (let i = 1; i < valid.length; i++) {
    const p = valid[i - 1]!, c = valid[i]!
    const cx = (p.x + c.x) / 2
    d += ` C ${cx} ${p.y} ${cx} ${c.y} ${c.x} ${c.y}`
  }
  return d
}

function SvgChart({
  labels, lines, yFmt = (v) => v.toFixed(1) + '%', height = 180,
}: {
  labels: string[]; lines: ChartLine[]; yFmt?: (v: number) => string; height?: number
}) {
  const [hoveredX, setHoveredX] = useState<number | null>(null)
  const W = 560, padL = 44, padR = 8, padT = 10, padB = 28
  const chartW = W - padL - padR
  const chartH = height - padT - padB

  const allVals = lines.flatMap(l => l.data).filter((v): v is number => v != null)
  if (allVals.length === 0) return <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No data</div>

  const minV = Math.min(...allVals), maxV = Math.max(...allVals)
  const range = maxV - minV || 1
  const padRange = range * 0.12
  const yMin = minV - padRange, yMax = maxV + padRange

  const xOf = (i: number) => padL + (i / (labels.length - 1 || 1)) * chartW
  const yOf = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * chartH

  // Y gridlines
  const yTicks: number[] = []
  const step = range < 5 ? 0.5 : range < 15 ? 2 : range < 40 ? 5 : 1
  const start = Math.ceil(yMin / step) * step
  for (let v = start; v <= yMax + 0.01; v += step) yTicks.push(+v.toFixed(2))

  // X axis: show ~6 labels evenly
  const xStep = Math.max(1, Math.floor(labels.length / 6))

  const hoveredIdx = hoveredX !== null
    ? Math.min(labels.length - 1, Math.max(0, Math.round(((hoveredX - padL) / chartW) * (labels.length - 1))))
    : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        style={{ height }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHoveredX((e.clientX - rect.left) * (W / rect.width))
        }}
        onMouseLeave={() => setHoveredX(null)}
      >
        {/* Gridlines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="rgba(0,0,0,0.06)" strokeWidth={0.75} />
            <text x={padL - 4} y={yOf(v) + 3.5} textAnchor="end" fontSize={8} fill="#9CA3AF">{yFmt(v)}</text>
          </g>
        ))}

        {/* X axis labels */}
        {labels.map((lbl, i) => i % xStep === 0 && (
          <text key={i} x={xOf(i)} y={height - 6} textAnchor="middle" fontSize={8} fill="#9CA3AF">
            {lbl.slice(5, 10)}
          </text>
        ))}

        {/* Lines */}
        {lines.map((line, li) => {
          const pts = line.data.map((v, i) => ({
            x: xOf(i), y: v != null ? yOf(v) : -9999
          }))
          const path = buildSmoothPath(pts)
          return (
            <g key={li}>
              {line.fill && path && (
                <path
                  d={`${path} L ${xOf(line.data.length - 1)} ${padT + chartH} L ${xOf(0)} ${padT + chartH} Z`}
                  fill={line.color}
                  opacity={0.08}
                />
              )}
              {path && (
                <path
                  d={path}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={line.dashed ? '5 4' : undefined}
                  strokeLinecap="round"
                  opacity={hoveredX !== null ? 0.85 : 0.9}
                />
              )}
            </g>
          )
        })}

        {/* Hover */}
        {hoveredIdx !== null && (
          <>
            <line x1={xOf(hoveredIdx)} x2={xOf(hoveredIdx)} y1={padT} y2={padT + chartH} stroke="#6B7280" strokeWidth={0.75} strokeDasharray="3 3" />
            {lines.map((line, li) => {
              const v = line.data[hoveredIdx]
              if (v == null) return null
              return <circle key={li} cx={xOf(hoveredIdx)} cy={yOf(v)} r={3.5} fill={line.color} stroke="#fff" strokeWidth={1.5} />
            })}
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div className="absolute top-0 left-8 bg-card border border-border rounded px-2 py-1 text-[10px] shadow-sm pointer-events-none space-y-0.5">
          <div className="text-muted-foreground font-medium">{labels[hoveredIdx]}</div>
          {lines.map((line, li) => {
            const v = line.data[hoveredIdx]
            return v != null ? (
              <div key={li} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
                <span style={{ color: line.color }}>{line.label}: {yFmt(v)}</span>
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header (── TITLE ──)
// ─────────────────────────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/50 whitespace-nowrap">{children}</span>
      <span className="flex-1 h-px bg-border/60" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrier surcharge card — uniform treatment, no colored borders, no LIVE badge
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: (number | null)[]; color: string }) {
  const valid = data.filter((v): v is number => v != null)
  if (valid.length < 2) return null
  const W = 88, H = 38
  const min = Math.min(...valid), max = Math.max(...valid)
  const range = max - min || 0.5
  const pts = data
    .map((v, i) => v != null
      ? { x: (i / (data.length - 1)) * W, y: H - 4 - ((v - min) / range) * (H - 10) }
      : null)
    .filter(Boolean) as { x: number; y: number }[]
  if (pts.length < 2) return null
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const fill = `${line} L${pts.at(-1)!.x.toFixed(1)} ${H} L${pts[0]!.x.toFixed(1)} ${H}Z`
  const last = pts.at(-1)!
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 self-center">
      <path d={fill} fill={color} opacity={0.07} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />
      <circle cx={last.x} cy={last.y} r={2.5} fill={color} opacity={0.9} />
    </svg>
  )
}

function CarrierLabel({ carrier }: { carrier: string }) {
  const id = carrier === 'UPS' ? 'ups' : carrier === 'FedEx' ? 'fedex' : null
  if (id) return <CarrierLogo carrier={id} size="sm" />
  return <span className="text-[11px] font-bold text-muted-foreground">{carrier}</span>
}

function SurchargeCard({
  carrier, service, value, contracted, delta, sparkData, sparkColor,
}: {
  carrier: string; service: string; value: string
  contracted: string | null; delta: number | null
  sparkData?: (number | null)[]; sparkColor?: string
}) {
  const isUp = delta != null && delta > 0.05
  const isDown = delta != null && delta < -0.05
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <CarrierLabel carrier={carrier} />
          <span className="text-xs text-muted-foreground">{service}</span>
        </div>
        {isUp && <span className="text-xs font-medium text-red-500">▲ +{delta!.toFixed(2)}pp</span>}
        {isDown && <span className="text-xs font-medium text-emerald-600">▼ {delta!.toFixed(2)}pp</span>}
        {!isUp && !isDown && delta != null && <span className="text-[10px] text-muted-foreground">flat</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        </div>
        {sparkData && sparkColor && <Sparkline data={sparkData} color={sparkColor} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ variant, children }: { variant: 'green' | 'red' | 'yellow' | 'gray' | 'teal'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-[#D1FAE5] text-[#065F46]',
    red: 'bg-[#FEE2E2] text-[#991B1B]',
    yellow: 'bg-[#FEF3C7] text-[#92400E]',
    gray: 'bg-muted text-muted-foreground',
    teal: 'bg-[#CCFBF1] text-[#134E4A]',
  }[variant]
  return <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>{children}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers for re-rating
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text: string): RerateRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
  return lines.slice(1).flatMap(line => {
    const values = line.split(',')
    const obj = Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]))
    const transport_charge = parseFloat(obj['transport_charge'] ?? '')
    const billed_fuel_surcharge = parseFloat(obj['billed_fuel_surcharge'] ?? '')
    if (!obj['tracking_number'] || !obj['ship_date'] || !obj['service'] || isNaN(transport_charge) || isNaN(billed_fuel_surcharge)) return []
    return [{ tracking_number: obj['tracking_number']!, ship_date: obj['ship_date']!, service: obj['service']!, transport_charge, billed_fuel_surcharge }]
  })
}

const CSV_TEMPLATE = 'tracking_number,ship_date,service,transport_charge,billed_fuel_surcharge\n1Z999AA10123456784,2026-05-12,Ground,12.45,3.43\n'

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'rerate_template.csv'
  a.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Rates tab (main view — matches prototype layout)
// ─────────────────────────────────────────────────────────────────────────────

function LiveRatesTab({ data }: { data: HistoryPayload | null }) {
  const [contract, setContract] = useState<Contract>(() => {
    if (typeof window === 'undefined') return { discountPct: 30, weeklySpend: 19000 }
    try { return JSON.parse(localStorage.getItem(CONTRACT_KEY) ?? '') } catch { return { discountPct: 30, weeklySpend: 19000 } }
  })
  const [contractOn, setContractOn] = useState(true)
  const [range, setRange] = useState<RangeWeeks>(13)
  const [aiBrief, setAiBrief] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)

  const combined = data ? buildCombined(data.ups, data.fedex, data.eia) : []
  const slice = range === 0 ? combined : combined.slice(-range)
  const labels = slice.map(r => r.week)

  const latest = combined.at(-1)
  const prior = combined.at(-2)

  const contracted = (v: number | null) =>
    contractOn && v != null ? +((v * (1 - contract.discountPct / 100))).toFixed(2) : null

  const lv = (k: keyof CombinedRow) => {
    for (let i = combined.length - 1; i >= 0; i--) {
      const v = combined[i]![k]
      if (v != null) return v as number
    }
    return null
  }
  const pv = (k: keyof CombinedRow) => {
    let n = 0
    for (let i = combined.length - 1; i >= 0; i--) {
      const v = combined[i]![k]
      if (v != null && ++n === 2) return v as number
    }
    return null
  }

  // Alert: UPS Ground spike ≥ 1.5pp
  const upsGCur = lv('upsGround'), upsGPrior = pv('upsGround')
  const spike = upsGCur != null && upsGPrior != null && (upsGCur - upsGPrior) >= 1.5

  // 5-wk EIA forecast
  const eiaLatest = lv('eia'), eiaLag = combined.length > 5 ? combined[combined.length - 6]?.eia ?? null : null
  const lagDiff = eiaLatest != null && eiaLag != null ? eiaLatest - eiaLag : null

  const spend = contract.weeklySpend
  const listCost = upsGCur != null ? spend * (upsGCur / 100) : null
  const contractedCost = contracted(upsGCur) != null ? spend * (contracted(upsGCur)! / 100) : null
  const savings = listCost != null && contractedCost != null ? listCost - contractedCost : null

  const saveContract = (c: Contract) => {
    setContract(c)
    localStorage.setItem(CONTRACT_KEY, JSON.stringify(c))
  }

  const runBrief = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/fuel-surcharges/ai-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyData: combined.slice(-6), weeklySpend: spend, contractDiscountPct: contract.discountPct }),
      })
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json() as { text?: string; error?: string }
      if (d.error) throw new Error(d.error)
      setAiBrief(d.text ?? '')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAiLoading(false)
    }
  }, [combined, spend, contract.discountPct])

  useEffect(() => {
    if (briefOpen && aiBrief === null && !aiLoading) void runBrief()
  }, [briefOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground animate-pulse">Loading live rates…</div>
  }

  return (
    <div className="space-y-5">

      {/* Context strip — persistent state, not controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pb-3 text-xs text-muted-foreground">
        {latest?.week && <span>Week of {latest.week}</span>}
        {latest?.week && <span className="text-border select-none">·</span>}
        <label className="flex cursor-pointer select-none items-center gap-1.5">
          <span className="relative inline-block h-[14px] w-6">
            <input type="checkbox" className="sr-only" checked={contractOn} onChange={e => setContractOn(e.target.checked)} />
            <span className={cn('absolute inset-0 rounded-full transition-colors', contractOn ? 'bg-sky-500' : 'bg-border')} />
            <span className={cn('absolute top-[2px] left-[2px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform', contractOn && 'translate-x-[10px]')} />
          </span>
          Contracted rates
        </label>
        {contractOn && (
          <>
            <span className="text-border select-none">·</span>
            <span className="flex items-center gap-1">
              Discount
              <input
                type="number" min={0} max={100} step={1} value={contract.discountPct}
                onChange={e => saveContract({ ...contract, discountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                className="w-9 rounded border border-input bg-background px-1 py-0 text-center text-xs font-medium"
              />
              %
            </span>
            {lv('upsGround') != null && contracted(lv('upsGround')) != null && (
              <>
                <span className="text-border select-none">·</span>
                <span>
                  <span style={{ color: '#C9941A' }} className="font-bold">UPS</span> Ground:{' '}
                  <span className="font-medium text-foreground">{lv('upsGround')!.toFixed(2)}% list</span>
                  {' → '}
                  <span className="font-medium text-sky-600">{contracted(lv('upsGround'))!.toFixed(2)}% contracted</span>
                  {' '}(saves {(lv('upsGround')! - contracted(lv('upsGround'))!).toFixed(2)}pp)
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Spike alert — operational, not decorative */}
      {spike && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300/50 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <span className="shrink-0 font-semibold">Rate spike</span>
          <span>
            <span style={{ color: '#C9941A' }} className="font-bold">UPS</span> Ground jumped {(upsGCur! - upsGPrior!).toFixed(2)}pp this week ({upsGPrior}% → {upsGCur}%) —
            approximately {fmtUSD((upsGCur! - upsGPrior!) / 100 * spend)} in additional weekly fuel cost at your spend level.
          </span>
        </div>
      )}

      {/* EIA Index band — causal/leading data, visually distinct from carrier cards */}
      <div className="rounded-lg border border-border/60 bg-muted/40 px-5 py-3.5">
        <div className="mb-2.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Fuel Index — Leading Indicator
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-2">
          <div className="flex items-baseline gap-2.5">
            <span className="text-xs font-medium text-muted-foreground">EIA Diesel</span>
            {lv('eia') != null ? (
              <>
                <span className="text-sm font-semibold text-foreground">${lv('eia')!.toFixed(3)}</span>
                {lagDiff != null && (
                  <span className={cn('text-xs font-medium', lagDiff > 0 ? 'text-red-500' : 'text-emerald-600')}>
                    {lagDiff > 0 ? '▲' : '▼'} {lagDiff > 0 ? '+' : ''}{lagDiff.toFixed(3)} vs 5 wks ago
                  </span>
                )}
                <span className="text-xs text-muted-foreground">→ sets surcharge in approx. 5–6 weeks</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">— No data</span>
            )}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-xs font-medium text-muted-foreground">EIA Jet Fuel</span>
            <span className="text-xs text-muted-foreground">— No data</span>
          </div>
        </div>
      </div>

      {/* Current Surcharges — 2×2, uniform cards, no colored borders, no LIVE */}
      <div>
        <div className="mb-3 text-xs font-medium text-muted-foreground">Current Surcharges</div>
        <div className="grid grid-cols-2 gap-3">
          <SurchargeCard
            carrier="UPS" service="Ground"
            value={lv('upsGround') != null ? lv('upsGround')!.toFixed(2) + '%' : '—'}
            contracted={contractOn && contracted(lv('upsGround')) != null ? contracted(lv('upsGround'))!.toFixed(2) + '%' : null}
            delta={prior?.upsGround != null && latest?.upsGround != null ? latest.upsGround - prior.upsGround : null}
            sparkData={slice.map(r => r.upsGround)} sparkColor={CARRIER_COLORS.ups}
          />
          <SurchargeCard
            carrier="FedEx" service="Ground"
            value={lv('fedexGround') != null ? lv('fedexGround')!.toFixed(2) + '%' : '—'}
            contracted={contractOn && contracted(lv('fedexGround')) != null ? contracted(lv('fedexGround'))!.toFixed(2) + '%' : null}
            delta={prior?.fedexGround != null && latest?.fedexGround != null ? latest.fedexGround - prior.fedexGround : null}
            sparkData={slice.map(r => r.fedexGround)} sparkColor={CARRIER_COLORS.fedex}
          />
          <SurchargeCard
            carrier="UPS" service="Air"
            value={lv('upsAir') != null ? lv('upsAir')!.toFixed(2) + '%' : '—'}
            contracted={contractOn && contracted(lv('upsAir')) != null ? contracted(lv('upsAir'))!.toFixed(2) + '%' : null}
            delta={prior?.upsAir != null && latest?.upsAir != null ? latest.upsAir - prior.upsAir : null}
            sparkData={slice.map(r => r.upsAir)} sparkColor={CARRIER_COLORS.ups}
          />
          <SurchargeCard
            carrier="FedEx" service="Express"
            value={lv('fedexExpress') != null ? lv('fedexExpress')!.toFixed(2) + '%' : '—'}
            contracted={contractOn && contracted(lv('fedexExpress')) != null ? contracted(lv('fedexExpress'))!.toFixed(2) + '%' : null}
            delta={prior?.fedexExpress != null && latest?.fedexExpress != null ? latest.fedexExpress - prior.fedexExpress : null}
            sparkData={slice.map(r => r.fedexExpress)} sparkColor={CARRIER_COLORS.fedex}
          />
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">OnTrac · Spee-Dee — surcharges not yet tracked</p>
      </div>

      {/* Dollar Exposure — asymmetric: small input, dominant outputs */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="mb-4 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Weekly Exposure</div>
        <div className="flex flex-wrap items-start gap-8">
          <div className="shrink-0">
            <div className="mb-1.5 text-xs text-muted-foreground">Weekly carrier spend</div>
            <input
              type="number" min={0} step={500} value={contract.weeklySpend}
              onChange={e => saveContract({ ...contract, weeklySpend: parseFloat(e.target.value) || 0 })}
              className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-1.5 text-[10px] text-muted-foreground">avg ~$19K/wk</div>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">List rate fuel cost</div>
              <div className="text-2xl font-semibold tracking-tight text-foreground">
                {listCost != null ? fmtUSD(listCost) : '—'}
                <span className="ml-0.5 text-sm font-normal text-muted-foreground">/wk</span>
              </div>
              {listCost != null && <div className="mt-1 text-xs text-muted-foreground">~{fmtUSDK(listCost * 52)}/yr</div>}
            </div>
            {contractedCost != null && savings != null && (
              <div className="border-l border-border pl-8">
                <div className="mb-1.5 text-xs text-muted-foreground">Contracted</div>
                <div className="text-2xl font-semibold tracking-tight text-emerald-600">
                  {fmtUSD(contractedCost)}
                  <span className="ml-0.5 text-sm font-normal text-muted-foreground">/wk</span>
                </div>
                <div className="mt-1 text-xs font-medium text-emerald-600">Saves {fmtUSD(savings)}/wk</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Range selector — understated, not pill buttons */}
      <div className="flex items-center gap-1.5">
        {([13, 26, 52, 0] as RangeWeeks[]).map(w => (
          <button
            key={w}
            onClick={() => setRange(w)}
            className={cn(
              'rounded border px-3 py-1 text-xs font-medium transition-colors',
              range === w
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >{w === 0 ? 'All time' : w === 52 ? '1 year' : `${w}w`}</button>
        ))}
      </div>

      {/* 2×2 charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">
            EIA Diesel <span className="font-normal text-muted-foreground">$/gal</span>
          </h3>
          <SvgChart
            labels={labels}
            lines={[{ label: 'EIA Diesel', data: slice.map(r => r.eia), color: CARRIER_COLORS.eiaD, fill: true }]}
            yFmt={v => '$' + v.toFixed(2)}
            height={200}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">
            <span style={{ color: '#C9941A' }}>UPS</span> Ground <span className="font-normal text-muted-foreground">% of base{contractOn ? ' — list vs contracted' : ''}</span>
          </h3>
          <SvgChart
            labels={labels}
            lines={[
              { label: 'UPS Ground (List)', data: slice.map(r => r.upsGround), color: CARRIER_COLORS.ups },
              ...(contractOn ? [{ label: 'Contracted', data: slice.map(r => r.upsGround != null ? +(r.upsGround * (1 - contract.discountPct / 100)).toFixed(2) : null), color: '#00B4C5', dashed: true }] : []),
            ]}
            yFmt={v => v.toFixed(1) + '%'}
            height={200}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">
            <span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6200' }}>Ex</span> Ground <span className="font-normal text-muted-foreground">% of base</span>
          </h3>
          <SvgChart
            labels={labels}
            lines={[{ label: 'FedEx Ground', data: slice.map(r => r.fedexGround), color: CARRIER_COLORS.fedex }]}
            yFmt={v => v.toFixed(1) + '%'}
            height={200}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">
            Air Surcharges <span className="font-normal text-muted-foreground"><span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6200' }}>Ex</span> Express vs <span style={{ color: '#C9941A' }}>UPS</span> Air</span>
          </h3>
          <SvgChart
            labels={labels}
            lines={[
              { label: 'FedEx Express', data: slice.map(r => r.fedexExpress), color: '#FF6200' },
              { label: 'UPS Air', data: slice.map(r => r.upsAir), color: CARRIER_COLORS.ups },
            ]}
            yFmt={v => v.toFixed(1) + '%'}
            height={200}
          />
        </div>
      </div>

      {/* Rate snapshot table */}
      <div>
        <div className="mb-3 text-xs font-medium text-muted-foreground">Rate Snapshot</div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Carrier', 'Service', 'This Week', 'Contracted', 'vs Prior Wk', 'Index', '5-Wk Outlook'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { carrier: 'UPS', service: 'Ground', cur: lv('upsGround'), prior: pv('upsGround'), idx: 'EIA Diesel' },
                { carrier: 'UPS', service: 'Air', cur: lv('upsAir'), prior: pv('upsAir'), idx: 'EIA Jet' },
                { carrier: 'FedEx', service: 'Ground', cur: lv('fedexGround'), prior: pv('fedexGround'), idx: 'EIA Diesel' },
                { carrier: 'FedEx', service: 'Express', cur: lv('fedexExpress'), prior: pv('fedexExpress'), idx: 'EIA Jet' },
              ].map((r) => {
                if (r.cur == null) return (
                  <tr key={r.carrier + r.service} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium"><CarrierLabel carrier={r.carrier} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.service}</td>
                    <td className="px-3 py-2.5 text-muted-foreground" colSpan={5}>Not tracked</td>
                  </tr>
                )
                const diff = r.prior != null ? r.cur - r.prior : null
                const cc = contractOn ? contracted(r.cur) : null
                const fc = lagDiff != null
                  ? lagDiff > 0.15 ? <Badge variant="yellow">↑ Rise likely</Badge>
                  : lagDiff < -0.15 ? <Badge variant="teal">↓ Drop likely</Badge>
                  : <Badge variant="gray">Stable</Badge>
                  : <Badge variant="gray">—</Badge>
                return (
                  <tr key={r.carrier + r.service} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium"><CarrierLabel carrier={r.carrier} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.service}</td>
                    <td className="px-3 py-2.5 font-semibold text-foreground">{r.cur.toFixed(2)}%</td>
                    <td className="px-3 py-2.5">
                      {cc != null
                        ? <span className="font-medium text-sky-600">{cc.toFixed(2)}%</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {diff == null
                        ? <span className="text-[10px] text-muted-foreground">—</span>
                        : Math.abs(diff) < 0.1
                          ? <span className="text-[10px] text-muted-foreground">flat</span>
                          : <span className={cn('font-medium', diff > 0 ? 'text-red-500' : 'text-emerald-600')}>
                              {diff > 0 ? '▲ +' : '▼ '}{diff.toFixed(2)}pp
                            </span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.idx}</td>
                    <td className="px-3 py-2.5">{fc}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EIA key warning */}
      {data.eiaError === 'rate_limited' && (
        <div className="rounded-md border border-amber-300/50 bg-amber-50/60 px-4 py-3 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">EIA data requires a free API key</p>
          <p className="mt-0.5 text-[11px] text-amber-600/80">
            Register at <span className="font-mono">eia.gov/opendata/register.php</span> then add{' '}
            <span className="font-mono">EIA_API_KEY=your_key</span> to <span className="font-mono">.env.local</span>
          </p>
        </div>
      )}

      {/* Market Brief — collapsible, at bottom, on demand */}
      <div className="rounded-lg border border-border bg-muted/30">
        <button
          onClick={() => setBriefOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={cn('text-[9px] transition-transform', briefOpen && 'rotate-90')}>▶</span>
            Market Brief
          </span>
          {briefOpen && (
            <button
              onClick={e => { e.stopPropagation(); void runBrief() }}
              disabled={aiLoading}
              className="text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {aiLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          )}
        </button>
        {briefOpen && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            {aiLoading && <p className="text-xs italic text-muted-foreground">Analyzing…</p>}
            {aiError && (
              <p className="text-xs text-destructive">
                {aiError.includes('ANTHROPIC_API_KEY') ? 'Add ANTHROPIC_API_KEY to .env.local to enable market briefs.' : aiError}
              </p>
            )}
            {aiBrief && !aiLoading && (
              <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{aiBrief}</p>
            )}
          </div>
        )}
      </div>

      <p className="text-right text-[10px] text-muted-foreground">
        EIA: eia.gov · Carrier rates: published FSC schedules · <strong>LogiFacts LLC</strong>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Fuel Audit (Re-Rating tab)
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceFuelAudit() {
  const [invoiceRows, setInvoiceRows] = useState<InvoiceFuelRow[] | null>(null)
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceFuelSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/fuel-surcharges/invoice-fuel')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { rows: InvoiceFuelRow[]; summary: InvoiceFuelSummary }
      setInvoiceRows(data.rows); setInvoiceSummary(data.summary); setLoaded(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div>
          <p className="text-[13px] font-bold text-foreground">From Your Uploaded Invoices</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Compares your billed fuel surcharge against the published rate for each week.</p>
        </div>
        <button
          disabled={loading}
          onClick={() => void load()}
          className="shrink-0 bg-primary text-primary-foreground text-[12px] font-semibold px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Analyze My Invoices'}
        </button>
      </div>

      {error && <div className="px-4 py-3 text-[12px] text-destructive">{error}</div>}

      {invoiceSummary && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Fuel Billed', value: fmtUSDK(invoiceSummary.total_fuel_billed), color: '' },
              { label: 'Weeks Analyzed', value: String(invoiceSummary.weeks_analyzed), color: '' },
              { label: 'Weeks Overbilled', value: String(invoiceSummary.weeks_overbilled), color: invoiceSummary.weeks_overbilled > 0 ? 'text-destructive' : 'text-[#10B981]' },
              { label: 'Total Overbilled', value: (invoiceSummary.total_overbilled_dollars > 0 ? '+' : '') + fmtUSDK(invoiceSummary.total_overbilled_dollars), color: invoiceSummary.total_overbilled_dollars > 0 ? 'text-destructive' : 'text-[#10B981]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/40 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                <div className={cn('font-heading text-xl font-bold mt-0.5', color)}>{value}</div>
              </div>
            ))}
          </div>

          {invoiceRows && invoiceRows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {['Week', 'Carrier', 'Billed Fuel', 'Transport', 'Implied Rate', 'Published Rate', 'Variance', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoiceRows.map((r, i) => (
                    <tr key={i} className={cn('hover:bg-muted/20', r.flag === 'overbilled' && 'bg-destructive/5')}>
                      <td className="px-3 py-2 font-medium">{r.week}</td>
                      <td className="px-3 py-2">{r.carrier}</td>
                      <td className="px-3 py-2 text-right">{fmtUSD(r.billed_fuel)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.billed_transport != null ? fmtUSD(r.billed_transport) : '—'}</td>
                      <td className="px-3 py-2 text-right">{r.implied_rate != null ? fmtPct(r.implied_rate) : '—'}</td>
                      <td className="px-3 py-2 text-right text-[#a2c7e2]">{r.published_rate != null ? fmtPct(r.published_rate) : '—'}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', r.variance_dollars != null && r.variance_dollars > 0 ? 'text-destructive' : 'text-[#10B981]')}>
                        {r.variance_dollars != null ? (r.variance_dollars >= 0 ? '+' : '') + fmtUSD(r.variance_dollars) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.flag === 'overbilled' ? <Badge variant="red">⚠ Overbilled</Badge>
                          : r.flag === 'underbilled' ? <Badge variant="yellow">↓ Underbilled</Badge>
                          : r.flag === 'correct' ? <Badge variant="green">✓ Correct</Badge>
                          : <Badge variant="gray">{r.flag === 'no_transport' ? 'No transport' : 'No rate'}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No invoice data found. Upload invoices in <a href="/premium-analysis" className="underline text-primary">Premium Analysis</a> to see your fuel audit here.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-Rating Tab
// ─────────────────────────────────────────────────────────────────────────────

function ReratingTab() {
  const [rows, setRows] = useState<RerateRow[]>([])
  const [results, setResults] = useState<RerateResult[]>([])
  const [summary, setSummary] = useState<RerateSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setFileName(file.name); setError(null); setResults([]); setSummary(null)
    const parsed = parseCSV(await file.text())
    if (parsed.length === 0) { setError('No valid rows found. Check column headers match the template.'); return }
    setRows(parsed)
  }

  async function runRerate() {
    if (rows.length === 0) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/fuel-surcharges/rerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { results: RerateResult[]; summary: RerateSummary }
      setResults(data.results); setSummary(data.summary)
    } catch (e) { setError(e instanceof Error ? e.message : 'Re-rating failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <InvoiceFuelAudit />

      <div className="relative flex items-center gap-3">
        <span className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground">or upload a custom shipment manifest</span>
        <span className="flex-1 h-px bg-border" />
      </div>

      <div className="bg-card rounded-lg border border-border p-4 space-y-4">
        <div>
          <p className="text-[13px] font-bold">Upload Shipment Data</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Required columns: <span className="font-mono text-[10px]">tracking_number, ship_date, service, transport_charge, billed_fuel_surcharge</span></p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={downloadTemplate} className="px-3 py-1.5 text-[12px] border border-border rounded-lg bg-card hover:bg-muted transition-colors">Download Template CSV</button>
          <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-[12px] border border-border rounded-lg bg-card hover:bg-muted transition-colors">Choose CSV File</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
        </div>
        {fileName && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[12px]">
            <span>{fileName} — <strong>{rows.length}</strong> rows parsed</span>
            {rows.length > 0 && <button disabled={loading} onClick={() => void runRerate()} className="bg-primary text-primary-foreground text-[12px] px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">{loading ? 'Running…' : 'Run Re-Rating'}</button>}
          </div>
        )}
        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Billed Fuel', value: fmtUSDK(summary.total_billed_fuel), cls: '' },
              { label: 'Expected Fuel', value: fmtUSDK(summary.total_expected_fuel), cls: 'text-[#10B981]' },
              { label: 'Total Variance', value: (summary.total_variance >= 0 ? '+' : '') + fmtUSDK(summary.total_variance), cls: summary.total_variance > 0 ? 'text-destructive' : 'text-[#10B981]' },
              { label: 'Overbilled Rows', value: `${summary.flagged_overbilled} / ${summary.total_rows}`, cls: summary.flagged_overbilled > 0 ? 'text-destructive' : 'text-[#10B981]' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-card rounded-lg border border-border px-4 py-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                <div className={cn('font-heading text-2xl font-bold mt-0.5', cls)}>{value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {['Tracking #', 'Date', 'Service', 'Transport', 'Billed Fuel', 'Expected Fuel', 'Variance', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => (
                  <tr key={i} className={cn('hover:bg-muted/20', r.flag === 'overbilled' && 'bg-destructive/5')}>
                    <td className="px-3 py-2 font-mono text-[10px]">{r.tracking_number}</td>
                    <td className="px-3 py-2">{r.ship_date}</td>
                    <td className="px-3 py-2">{r.service}</td>
                    <td className="px-3 py-2 text-right">{fmtUSD(r.transport_charge)}</td>
                    <td className="px-3 py-2 text-right">{fmtUSD(r.billed_fuel_surcharge)}</td>
                    <td className="px-3 py-2 text-right text-[#10B981]">{r.expected_fuel != null ? fmtUSD(r.expected_fuel) : '—'}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold', r.variance != null && r.variance > 0 ? 'text-destructive' : 'text-[#10B981]')}>
                      {r.variance != null ? (r.variance >= 0 ? '+' : '') + fmtUSD(r.variance) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.flag === 'overbilled' ? <Badge variant="red">⚠ Overbilled</Badge>
                        : r.flag === 'underbilled' ? <Badge variant="yellow">↓ Underbilled</Badge>
                        : r.flag === 'correct' ? <Badge variant="green">✓ Correct</Badge>
                        : <Badge variant="gray">No rate</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Hub
// ─────────────────────────────────────────────────────────────────────────────

export function FuelSurchargeHub() {
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [data, setData] = useState<HistoryPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/fuel-surcharges/history')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d as HistoryPayload) })
      .finally(() => setLoading(false))
  }, [])

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'live', label: 'Live Intelligence' },
    { id: 'rerate', label: 'Invoice Re-Rating' },
    { id: 'contract', label: 'My Contract' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-midnight px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-[#E8453C] rounded-full" />
              <span className="text-[11px] font-semibold tracking-[0.1em] text-[#A8C4E0] uppercase">LogiFacts</span>
            </div>
            <h2 className="font-heading text-2xl font-bold text-white">Fuel Surcharge Intelligence</h2>
            <p className="text-[12px] text-[#A8C4E0] mt-1">U.S. National &amp; Regional Parcel Carriers · Weekly EIA Index</p>
            {/* Live indicator */}
            <div className="flex items-center gap-2 mt-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00B4C5] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00B4C5]" />
              </span>
              <span className="text-[11px] font-semibold text-[#00B4C5] tracking-wide uppercase">Live</span>
              <span className="text-[11px] text-[#A8C4E0]/60">· rates update every Monday</span>
            </div>
          </div>
          {data && (
            <div className="text-right">
              <div className="text-[10px] text-[#A8C4E0]">Data through</div>
              <div className="text-[14px] font-semibold text-white mt-1">
                {data.ups[0]?.effectiveDate
                  ? new Date(data.ups[0].effectiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : '—'}
              </div>
              {/* Source badges */}
              <div className="flex items-center justify-end gap-1.5 mt-2">
                <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B4C5] animate-pulse" />
                  <CarrierLogo carrier="ups" size="sm" className="brightness-110" />
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B4C5] animate-pulse" />
                  <CarrierLogo carrier="fedex" size="sm" />
                </span>
                {/* EIA — blue */}
                <span className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B4C5] animate-pulse" />
                  <span className="text-[9px] font-black" style={{ color: '#3B82F6', letterSpacing: '0.04em' }}>EIA</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            )}
          >{tab.label}</button>
        ))}
      </div>

      {loading && <div className="flex h-48 items-center justify-center text-sm text-muted-foreground animate-pulse">Loading…</div>}

      {!loading && activeTab === 'live' && <LiveRatesTab data={data} />}
      {activeTab === 'rerate' && <ReratingTab />}
      {activeTab === 'contract' && (
        <div className="bg-card rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">Contract settings are now in the <button onClick={() => setActiveTab('live')} className="text-primary underline underline-offset-2">Live Intelligence</button> tab — use the contract toggle bar to set your discount percentage.</p>
        </div>
      )}
    </div>
  )
}
