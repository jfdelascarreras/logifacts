import { createClient } from '@/lib/supabase/server'
import { VolumeChart, type DayPoint } from './volume-chart'

type RawRequest = {
  origin_zip: string
  destination_zip: string
  status: string
  created_at: string
  completed_at: string | null
  breakdown: unknown
}

function getCarrierField(breakdown: unknown, carrier: 'ups' | 'fedex', field: string): unknown {
  if (!breakdown || typeof breakdown !== 'object') return undefined
  const part = (breakdown as Record<string, unknown>)[carrier]
  if (!part || typeof part !== 'object') return undefined
  return (part as Record<string, unknown>)[field]
}

function buildDayRange(period: number): DayPoint[] {
  const points: DayPoint[] = []
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    points.push({ date: d.toISOString().slice(0, 10), completed: 0, errors: 0 })
  }
  return points
}

// ── Section: Summary Cards ────────────────────────────────────────────────────

function SummaryCards({ requests, period }: { requests: RawRequest[]; period: number }) {
  const total = requests.length
  const completed = requests.filter((r) => r.status === 'completed').length
  const errors = requests.filter((r) => r.status === 'error').length
  const successRate = total > 0 ? (completed / total) * 100 : null

  const responseTimes = requests
    .filter((r) => r.status === 'completed' && r.completed_at)
    .map((r) => new Date(r.completed_at!).getTime() - new Date(r.created_at).getTime())
    .filter((ms) => ms > 0 && ms < 60_000)

  const avgMs =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

  const cards = [
    {
      label: 'Total Requests',
      value: total.toLocaleString(),
      sub: `last ${period} days`,
      accent: false,
    },
    {
      label: 'Success Rate',
      value: successRate !== null ? `${successRate.toFixed(1)}%` : '—',
      sub: total > 0 ? `${completed.toLocaleString()} completed` : 'no data',
      accent: false,
    },
    {
      label: 'Avg Response',
      value: avgMs !== null ? `${Math.round(avgMs)} ms` : '—',
      sub: 'completed requests only',
      accent: false,
    },
    {
      label: 'Errors',
      value: errors.toLocaleString(),
      sub: total > 0 ? `${((errors / total) * 100).toFixed(1)}% of total` : 'no data',
      accent: errors > 0,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          <p
            className={`mt-1 text-2xl font-bold ${card.accent ? 'text-destructive' : 'text-foreground'}`}
          >
            {card.value}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Section: Carrier Comparison ───────────────────────────────────────────────

function CarrierComparison({ requests }: { requests: RawRequest[] }) {
  let upsWins = 0
  let fedexWins = 0
  let equal = 0
  let upsFailed = 0
  let fedexFailed = 0

  for (const r of requests) {
    if (r.status !== 'completed') continue
    const upsRate = getCarrierField(r.breakdown, 'ups', 'totalEstimatedCharge')
    const fedexRate = getCarrierField(r.breakdown, 'fedex', 'totalEstimatedCharge')
    const upsN = typeof upsRate === 'number' ? upsRate : null
    const fedexN = typeof fedexRate === 'number' ? fedexRate : null

    if (upsN !== null && fedexN !== null) {
      if (upsN < fedexN - 0.01) upsWins++
      else if (fedexN < upsN - 0.01) fedexWins++
      else equal++
    } else if (upsN !== null) {
      fedexFailed++
    } else if (fedexN !== null) {
      upsFailed++
    }
  }

  const compared = upsWins + fedexWins + equal

  const rows = [
    { label: 'UPS cheaper', count: upsWins, color: 'bg-amber-500' },
    { label: 'FedEx cheaper', count: fedexWins, color: 'bg-blue-500' },
    { label: 'Equal', count: equal, color: 'bg-zinc-400' },
  ]

  return (
    <div className="rounded-xl border border-border p-5">
      <p className="text-sm font-semibold text-foreground">Carrier Comparison</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Based on{' '}
        <span className="font-medium text-foreground">{compared.toLocaleString()}</span> requests
        where both carriers returned a rate
      </p>

      {compared === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No comparison data yet</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const pct = (row.count / compared) * 100
            return (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-foreground">
                    {row.count.toLocaleString()}{' '}
                    <span className="text-muted-foreground">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${row.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}

          {(upsFailed + fedexFailed) > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              {upsFailed > 0 && `${upsFailed} with UPS unavailable`}
              {upsFailed > 0 && fedexFailed > 0 && ' · '}
              {fedexFailed > 0 && `${fedexFailed} with FedEx unavailable`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section: Error Breakdown ──────────────────────────────────────────────────

function ErrorBreakdown({ requests }: { requests: RawRequest[] }) {
  const fullErrors = requests.filter((r) => r.status === 'error')

  // Partial errors: completed but at least one carrier failed
  const partialErrors = requests.filter((r) => {
    if (r.status !== 'completed') return false
    const upsErr = getCarrierField(r.breakdown, 'ups', 'error')
    const fedexErr = getCarrierField(r.breakdown, 'fedex', 'error')
    return typeof upsErr === 'string' || typeof fedexErr === 'string'
  })

  // Collect all error message strings
  const errorMessages: string[] = []
  for (const r of [...fullErrors, ...partialErrors]) {
    const upsErr = getCarrierField(r.breakdown, 'ups', 'error')
    const fedexErr = getCarrierField(r.breakdown, 'fedex', 'error')
    if (typeof upsErr === 'string') errorMessages.push(upsErr)
    if (typeof fedexErr === 'string') errorMessages.push(fedexErr)
  }

  const counts = new Map<string, number>()
  for (const msg of errorMessages) {
    counts.set(msg, (counts.get(msg) ?? 0) + 1)
  }

  const top = Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <div className="rounded-xl border border-border p-5">
      <p className="text-sm font-semibold text-foreground">Error Breakdown</p>
      <div className="mt-0.5 flex gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-destructive">{fullErrors.length}</span> full errors
        </p>
        {partialErrors.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {partialErrors.length}
            </span>{' '}
            partial (one carrier failed)
          </p>
        )}
      </div>

      {top.length === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            No errors in this period
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {top.map(([msg, count]) => (
            <li key={msg} className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">{msg}</p>
              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Rate-limit and auth rejections are not tracked — they are refused before logging.
      </p>
    </div>
  )
}

// ── Section: Top Routes ───────────────────────────────────────────────────────

function TopRoutes({ requests }: { requests: RawRequest[] }) {
  const routeCounts = new Map<string, number>()
  for (const r of requests) {
    const key = `${r.origin_zip}|${r.destination_zip}`
    routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1)
  }

  const sorted = Array.from(routeCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const maxCount = sorted.length > 0 ? sorted[0][1] : 1

  return (
    <div className="rounded-xl border border-border p-5">
      <p className="text-sm font-semibold text-foreground">Top Routes</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Origin → Destination by request count
      </p>

      {sorted.length === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No route data yet</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {sorted.map(([key, count], i) => {
                const sep = key.indexOf('|')
                const origin = key.slice(0, sep)
                const dest = key.slice(sep + 1)
                const pct = (count / maxCount) * 100
                return (
                  <tr key={key}>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-6">
                      <span className="font-mono text-xs font-medium text-foreground">
                        {origin}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-mono text-xs font-medium text-foreground">{dest}</span>
                    </td>
                    <td className="w-28 py-2 pr-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right text-xs font-medium text-foreground">
                      {count.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────

export async function UsageDashboard({
  customerId,
  period,
}: {
  customerId: string
  period: number
}) {
  const supabase = await createClient()

  const since = new Date()
  since.setDate(since.getDate() - period)

  const { data } = await supabase
    .from('rate_requests')
    .select('origin_zip, destination_zip, status, created_at, completed_at, breakdown')
    .eq('customer_id', customerId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  const requests = (data ?? []) as RawRequest[]

  // Build the full day range and tally counts
  const days = buildDayRange(period)
  const dayMap = new Map(days.map((d) => [d.date, d]))

  for (const r of requests) {
    const point = dayMap.get(r.created_at.slice(0, 10))
    if (!point) continue
    if (r.status === 'completed') point.completed++
    else if (r.status === 'error') point.errors++
  }

  return (
    <div className="space-y-6">
      <SummaryCards requests={requests} period={period} />
      <VolumeChart days={days} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CarrierComparison requests={requests} />
        <ErrorBreakdown requests={requests} />
      </div>
      <TopRoutes requests={requests} />
    </div>
  )
}
