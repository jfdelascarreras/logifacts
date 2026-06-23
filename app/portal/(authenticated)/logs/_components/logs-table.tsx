'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export type LogRow = {
  id: string
  origin_zip: string
  destination_zip: string
  weight_lbs: number
  markup_pct: number
  status: string
  created_at: string
  completed_at: string | null
  breakdown: unknown
}

type NormalizedCarrier =
  | {
      ok: true
      serviceType: string
      billedWeightLbs: number
      billedWeightSource: string
      baseRate: number
      contractDiscount: number
      fuelSurcharge: number
      accessorialCharges: number
      markupApplied: number
      finalRate: number
    }
  | { ok: false; error: string }

// ── Normalization ─────────────────────────────────────────────────────────────

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function normalizeCarrier(breakdown: unknown, carrier: 'ups' | 'fedex', markupPct: number): NormalizedCarrier {
  if (!breakdown || typeof breakdown !== 'object') return { ok: false, error: 'No breakdown data' }
  const part = (breakdown as Record<string, unknown>)[carrier]
  if (!part || typeof part !== 'object') return { ok: false, error: 'No data' }
  const p = part as Record<string, unknown>

  if (typeof p.error === 'string') return { ok: false, error: p.error }

  // External API format — has final_rate, pre-computed fields
  if (typeof p.final_rate === 'number') {
    return {
      ok: true,
      serviceType: String(p.service_type ?? carrier),
      billedWeightLbs: num(p.billed_weight_lbs),
      billedWeightSource: String(p.billed_weight_source ?? 'actual'),
      baseRate: num(p.base_rate),
      contractDiscount: num(p.contract_discount_applied),
      fuelSurcharge: num(p.fuel_surcharge),
      accessorialCharges: num(p.accessorial_charges),
      markupApplied: num(p.markup_applied),
      finalRate: p.final_rate,
    }
  }

  // Portal format — UPSRateBreakdown / FedExRateBreakdown fields
  if (typeof p.totalEstimatedCharge === 'number') {
    const base = num(p.publishedRate)
    const netTransport = num(p.netTransportationCharge)
    const fuel = num(p.fuelSurcharge)
    const accessorials = round2(p.totalEstimatedCharge - netTransport - fuel)
    const markupApplied = round2(p.totalEstimatedCharge * (markupPct / 100))
    const finalRate = round2(p.totalEstimatedCharge + markupApplied)

    return {
      ok: true,
      serviceType: String(p.service ?? carrier),
      billedWeightLbs: num(p.billableWeightLbs),
      billedWeightSource: String(p.billableWeightSource ?? 'actual'),
      baseRate: base,
      contractDiscount: round2(base - netTransport),
      fuelSurcharge: fuel,
      accessorialCharges: Math.max(0, accessorials),
      markupApplied,
      finalRate,
    }
  }

  return { ok: false, error: 'Unrecognised breakdown format' }
}

function getDisplayRate(breakdown: unknown, carrier: 'ups' | 'fedex', markupPct: number): number | null {
  const result = normalizeCarrier(breakdown, carrier, markupPct)
  return result.ok ? result.finalRate : null
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$$(n: number) {
  return `$${n.toFixed(2)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function serviceLabel(key: string) {
  const map: Record<string, string> = {
    ground: 'Ground',
    home_delivery: 'Home Delivery',
    express: 'Express',
    express_saver: 'Express Saver',
    two_day: '2-Day',
    overnight: 'Overnight',
    ups_saver: 'UPS Saver',
    ups_3_day_select: '3 Day Select',
    ups_2nd_day_air: '2nd Day Air',
    ups_next_day_air_saver: 'Next Day Air Saver',
    ups_next_day_air: 'Next Day Air',
  }
  return map[key] ?? key
}

// ── Breakdown table ───────────────────────────────────────────────────────────

function BreakdownTable({
  carrier,
  label,
  row,
}: {
  carrier: 'ups' | 'fedex'
  label: string
  row: LogRow
}) {
  const result = normalizeCarrier(row.breakdown, carrier, num(row.markup_pct))

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="mt-2 text-xs text-destructive">{result.error}</p>
      </div>
    )
  }

  const lines = [
    {
      label: `Billed Weight`,
      value: `${result.billedWeightLbs} lbs (${result.billedWeightSource})`,
    },
    { label: 'Base Rate', value: fmt$$(result.baseRate) },
    {
      label: 'Contract Discount',
      value: result.contractDiscount > 0 ? `-${fmt$$(result.contractDiscount)}` : '$0.00',
    },
    { label: 'Fuel Surcharge', value: fmt$$(result.fuelSurcharge) },
    { label: 'Accessorials', value: fmt$$(result.accessorialCharges) },
    ...(num(row.markup_pct) > 0
      ? [{ label: `Markup (${num(row.markup_pct)}%)`, value: fmt$$(result.markupApplied) }]
      : []),
  ]

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/40 px-3 py-2">
        <p className="text-xs font-semibold text-foreground">
          {label} {serviceLabel(result.serviceType)}
        </p>
      </div>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-border">
          {lines.map((line) => (
            <tr key={line.label}>
              <td className="px-3 py-1.5 text-muted-foreground">{line.label}</td>
              <td className="px-3 py-1.5 text-right font-mono text-foreground">{line.value}</td>
            </tr>
          ))}
          <tr className="bg-muted/20">
            <td className="px-3 py-2 font-semibold text-foreground">Final Rate</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
              {fmt$$(result.finalRate)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function ExpandedRow({ row }: { row: LogRow }) {
  const responseMs =
    row.completed_at
      ? new Date(row.completed_at).getTime() - new Date(row.created_at).getTime()
      : null

  return (
    <tr>
      <td colSpan={7} className="border-b border-border bg-muted/20 px-4 py-4">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">REQUEST ID</p>
            <p className="font-mono text-xs text-foreground">{row.id}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium text-muted-foreground">TIMESTAMP</p>
            <p className="text-xs text-foreground">{fmtDateLong(row.created_at)}</p>
          </div>
          {responseMs !== null && (
            <div className="text-right">
              <p className="text-[11px] font-medium text-muted-foreground">RESPONSE TIME</p>
              <p className="text-xs text-foreground">{responseMs} ms</p>
            </div>
          )}
        </div>

        {/* Breakdowns */}
        <div className="grid gap-3 sm:grid-cols-2">
          <BreakdownTable carrier="ups" label="UPS" row={row} />
          <BreakdownTable carrier="fedex" label="FedEx" row={row} />
        </div>
      </td>
    </tr>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        Completed
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
      {status}
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  page,
  pages,
  total,
}: {
  page: number
  pages: number
  total: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function go(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  if (pages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-2 text-sm">
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString()} result{total !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted/50"
        >
          ← Prev
        </button>
        <span className="text-xs text-muted-foreground">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= pages}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted/50"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LogsTable({
  rows,
  total,
  page,
  pages,
  hasFilters,
}: {
  rows: LogRow[]
  total: number
  page: number
  pages: number
  hasFilters: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // Empty state
  if (rows.length === 0) {
    if (!hasFilters) {
      return (
        <div className="rounded-xl border border-border bg-muted/20 px-6 py-16 text-center">
          <p className="font-medium text-foreground">No API calls recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Make your first request using the Rate Calculator or your API integration.
          </p>
          <Link
            href="/portal/calculator"
            className="mt-4 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Open Rate Calculator
          </Link>
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-border bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No requests match these filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-6 px-2" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Route
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Weight
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                UPS
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                FedEx
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const isExpanded = expandedId === row.id
              const upsRate = getDisplayRate(row.breakdown, 'ups', num(row.markup_pct))
              const fedexRate = getDisplayRate(row.breakdown, 'fedex', num(row.markup_pct))

              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggle(row.id)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/30',
                      isExpanded && 'bg-muted/20',
                    )}
                  >
                    <td className="pl-3 pr-1 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDownIcon className="size-3.5" />
                      ) : (
                        <ChevronRightIcon className="size-3.5" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {fmtDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-foreground">
                        {row.origin_zip}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-mono text-xs font-medium text-foreground">
                        {row.destination_zip}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                      {num(row.weight_lbs)} lbs
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-foreground">
                      {upsRate !== null ? fmt$$(upsRate) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-foreground">
                      {fedexRate !== null ? fmt$$(fedexRate) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {row.id.slice(0, 8)}
                    </td>
                  </tr>
                  {isExpanded && <ExpandedRow key={`${row.id}-expanded`} row={row} />}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} />
    </div>
  )
}
