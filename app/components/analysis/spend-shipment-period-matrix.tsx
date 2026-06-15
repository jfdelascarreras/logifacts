'use client'

import { useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SpendShipmentPeriodMatrix } from '@/lib/premium-analysis/period-averages-matrix'

type MatrixView = 'year' | 'month' | 'week'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtShipments(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Minimum visible tint for any non-zero value; scales up to ~50% mix at max. */
function heatAlpha(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  const ratio = value / max
  return 0.18 + 0.32 * Math.sqrt(ratio)
}

type CellData = { avgSpend: number; avgShipments: number }

function heatBg(value: number, max: number, colorVar: string): string | undefined {
  const alpha = heatAlpha(value, max)
  if (alpha <= 0) return undefined
  return `color-mix(in srgb, ${colorVar} ${Math.round(alpha * 100)}%, transparent)`
}

function EmptyMetricCells({ yearStart }: { yearStart: boolean }) {
  const border = yearStart ? 'border-l-2 border-border' : ''
  return (
    <>
      <td className={cn('px-2 py-2 text-center text-muted-foreground/40', border)}>—</td>
      <td className="px-2 py-2 text-center text-muted-foreground/40">—</td>
    </>
  )
}

function DualMetricCells({
  cell,
  maxSpend,
  maxShip,
  spendColorVar,
  shipColorVar,
  yearStart,
}: {
  cell: CellData | undefined
  maxSpend: number
  maxShip: number
  spendColorVar: string
  shipColorVar: string
  yearStart: boolean
}) {
  if (!cell || (cell.avgSpend <= 0 && cell.avgShipments <= 0)) {
    return <EmptyMetricCells yearStart={yearStart} />
  }

  const spendBg = heatBg(cell.avgSpend, maxSpend, spendColorVar)
  const shipBg = heatBg(cell.avgShipments, maxShip, shipColorVar)

  return (
    <>
      <td
        className={cn(
          'px-2 py-2 text-center tabular-nums text-foreground',
          yearStart && 'border-l-2 border-border'
        )}
        style={{ backgroundColor: spendBg }}
        title={`Avg spend / active day: $${fmtMoney(cell.avgSpend)}`}
      >
        ${fmtMoney(cell.avgSpend)}
      </td>
      <td
        className="px-2 py-2 text-center tabular-nums text-foreground"
        style={{ backgroundColor: shipBg }}
        title={`Avg shipments / active day: ${fmtShipments(cell.avgShipments)}`}
      >
        {fmtShipments(cell.avgShipments)}
      </td>
    </>
  )
}

function MatrixColGroup({ years }: { years: number[] }) {
  return (
    <colgroup>
      <col style={{ width: '3.5rem' }} />
      {years.flatMap((y) => [
        <col key={`${y}-spend`} style={{ width: '4.75rem' }} />,
        <col key={`${y}-ship`} style={{ width: '4.25rem' }} />,
      ])}
    </colgroup>
  )
}

type Props = {
  matrix: SpendShipmentPeriodMatrix
}

export function SpendShipmentPeriodMatrixCard({ matrix }: Props) {
  const [view, setView] = useState<MatrixView>('month')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const byYearSorted = useMemo(
    () => [...matrix.byYear].sort((a, b) => a.year - b.year),
    [matrix.byYear]
  )

  const yearsForMonth = useMemo(
    () => [...new Set(matrix.byYearMonth.map((r) => r.year))].sort((a, b) => a - b),
    [matrix.byYearMonth]
  )

  const yearsForWeek = useMemo(
    () => [...new Set(matrix.byYearWeek.map((r) => r.year))].sort((a, b) => a - b),
    [matrix.byYearWeek]
  )

  const monthGrid = useMemo(() => {
    const map = new Map<string, CellData>()
    let maxSpend = 0
    let maxShip = 0
    for (const row of matrix.byYearMonth) {
      const key = `${row.year}-${row.month}`
      map.set(key, { avgSpend: row.avgSpend, avgShipments: row.avgShipments })
      maxSpend = Math.max(maxSpend, row.avgSpend)
      maxShip = Math.max(maxShip, row.avgShipments)
    }
    return { map, maxSpend, maxShip }
  }, [matrix.byYearMonth])

  const chronologicalMonths = useMemo(
    () =>
      [...matrix.byYearMonth]
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
        .map((r) => ({
          key: `${r.year}-${r.month}`,
          label: `${MONTH_SHORT[r.month - 1]} '${String(r.year).slice(-2)}`,
          cell: { avgSpend: r.avgSpend, avgShipments: r.avgShipments },
        })),
    [matrix.byYearMonth]
  )

  /** Pivoted year×month grid when enough months exist; otherwise chronological list. */
  const useMonthPivot = useMemo(() => {
    if (yearsForMonth.length <= 1) return true
    const threshold = yearsForMonth.length * 8
    return matrix.byYearMonth.length >= threshold
  }, [matrix.byYearMonth.length, yearsForMonth.length])

  const pivotMonthRows = useMemo(() => {
    const monthsWithData = new Set(matrix.byYearMonth.map((r) => r.month))
    return [...monthsWithData].sort((a, b) => a - b)
  }, [matrix.byYearMonth])

  const weekGrid = useMemo(() => {
    const weeks = [...new Set(matrix.byYearWeek.map((r) => r.weekOfYear))].sort((a, b) => a - b)
    const map = new Map<string, CellData>()
    let maxSpend = 0
    let maxShip = 0
    for (const row of matrix.byYearWeek) {
      const key = `${row.year}-${row.weekOfYear}`
      map.set(key, { avgSpend: row.avgSpend, avgShipments: row.avgShipments })
      maxSpend = Math.max(maxSpend, row.avgSpend)
      maxShip = Math.max(maxShip, row.avgShipments)
    }
    return { weeks, map, maxSpend, maxShip }
  }, [matrix.byYearWeek])

  async function exportExcel() {
    setExporting(true)
    setExportError(null)
    try {
      const res = await fetch('/api/invoices/analyze/export-period-matrix', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodMatrix: matrix }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `avg-spend-shipments_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (!byYearSorted.length && !chronologicalMonths.length && !weekGrid.weeks.length) return null

  function yearGroupHeader(years: number[], periodLabel: 'Week' | 'Month') {
    if (!years.length) return null
    return (
      <>
        <tr className="border-b border-border bg-muted/40">
          <th
            rowSpan={2}
            className="sticky left-0 z-20 bg-muted/40 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
          >
            {periodLabel}
          </th>
          {years.map((y, i) => (
            <th
              key={y}
              colSpan={2}
              className={cn(
                'px-2 py-2 text-center text-xs font-semibold text-foreground',
                i > 0 && 'border-l-2 border-border'
              )}
            >
              {y}
            </th>
          ))}
        </tr>
        <tr className="border-b border-border bg-muted/25">
          {years.flatMap((y, i) => [
            <th
              key={`${y}-spend`}
              className={cn(
                'px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground',
                i > 0 && 'border-l-2 border-border'
              )}
            >
              Spend
            </th>,
            <th
              key={`${y}-ship`}
              className="px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground"
            >
              Shipments
            </th>,
          ])}
        </tr>
      </>
    )
  }

  function renderPivotMonthRow(month: number) {
    return (
      <tr key={month} className="border-b border-border/60 hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card px-2 py-2 text-xs font-medium text-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
          {MONTH_SHORT[month - 1]}
        </td>
        {yearsForMonth.flatMap((y, yearIndex) => {
          const cell = monthGrid.map.get(`${y}-${month}`)
          return (
            <DualMetricCells
              key={`${y}-${month}`}
              cell={cell}
              maxSpend={monthGrid.maxSpend}
              maxShip={monthGrid.maxShip}
              spendColorVar="var(--chart-1)"
              shipColorVar="var(--chart-2)"
              yearStart={yearIndex > 0}
            />
          )
        })}
      </tr>
    )
  }

  function renderWeekRow(week: number) {
    return (
      <tr key={week} className="border-b border-border/60 hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-card px-2 py-2 text-xs font-medium tabular-nums text-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
          W{String(week).padStart(2, '0')}
        </td>
        {yearsForWeek.flatMap((y, yearIndex) => {
          const cell = weekGrid.map.get(`${y}-${week}`)
          return (
            <DualMetricCells
              key={`${y}-${week}`}
              cell={cell}
              maxSpend={weekGrid.maxSpend}
              maxShip={weekGrid.maxShip}
              spendColorVar="var(--chart-1)"
              shipColorVar="var(--chart-2)"
              yearStart={yearIndex > 0}
            />
          )
        })}
      </tr>
    )
  }

  return (
    <Card className="border-accent/25 bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Average spend &amp; shipments</CardTitle>
            <CardDescription>
              Matrix by year, calendar month, and ISO week of year. Each cell shows avg spend and avg shipments per
              active day side by side. Years run low to high. Shipments are distinct tracking or reference keys.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-accent/40 text-accent hover:bg-accent/10"
            onClick={() => void exportExcel()}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Exporting…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Export Excel
              </>
            )}
          </Button>
        </div>
        {exportError ? (
          <p className="text-xs text-destructive" role="alert">
            {exportError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {(['year', 'month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                view === v
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-border text-muted-foreground hover:border-accent/40 hover:text-foreground'
              )}
            >
              {v === 'week' ? 'Week of year' : v}
            </button>
          ))}
          {view !== 'year' ? (
            <span className="ml-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-[var(--chart-1)] opacity-70" />
                Spend
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-[var(--chart-2)] opacity-70" />
                Shipments
              </span>
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {view === 'year' ? (
          <div className="overflow-x-auto rounded-md border border-border" tabIndex={0} role="region" aria-label="Year averages table">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium text-right">Total spend</th>
                  <th className="px-3 py-2 font-medium text-right">Avg spend / day</th>
                  <th className="px-3 py-2 font-medium text-right">Avg spend / week</th>
                  <th className="px-3 py-2 font-medium text-right">Total shipments</th>
                  <th className="px-3 py-2 font-medium text-right">Avg ship. / day</th>
                  <th className="px-3 py-2 font-medium text-right">Avg ship. / week</th>
                  <th className="px-3 py-2 font-medium text-right">Active days</th>
                </tr>
              </thead>
              <tbody>
                {byYearSorted.map((row) => (
                  <tr key={row.year} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{row.year}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(row.totalSpend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(row.avgSpend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(row.avgSpendPerWeek)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.totalShipments.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtShipments(row.avgShipments)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtShipments(row.avgShipmentsPerWeek)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.activeDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {view === 'month' && chronologicalMonths.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {useMonthPivot
                ? 'Calendar months by year — avg spend and avg shipments per active day. Empty cells had no invoice activity.'
                : 'Chronological months with invoice data — avg spend and avg shipments per active day.'}
            </p>
            {useMonthPivot ? (
              <div
                className="overflow-x-auto rounded-md border border-border"
                tabIndex={0}
                role="region"
                aria-label="Month year matrix"
              >
                <table className="w-full table-fixed border-collapse text-xs">
                  <MatrixColGroup years={yearsForMonth} />
                  <thead className="sticky top-0 z-10">{yearGroupHeader(yearsForMonth, 'Month')}</thead>
                  <tbody>
                    {pivotMonthRows.map((month) => renderPivotMonthRow(month))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="overflow-x-auto rounded-md border border-border"
                tabIndex={0}
                role="region"
                aria-label="Chronological month averages"
              >
                <table className="w-full max-w-md table-fixed border-collapse text-xs">
                  <colgroup>
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5.5rem' }} />
                    <col style={{ width: '5rem' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Period
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Avg spend / day
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Avg ship. / day
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chronologicalMonths.map((row) => (
                      <tr key={row.key} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
                        <td
                          className="px-3 py-2 text-center tabular-nums"
                          style={{ backgroundColor: heatBg(row.cell.avgSpend, monthGrid.maxSpend, 'var(--chart-1)') }}
                        >
                          ${fmtMoney(row.cell.avgSpend)}
                        </td>
                        <td
                          className="px-3 py-2 text-center tabular-nums"
                          style={{
                            backgroundColor: heatBg(row.cell.avgShipments, monthGrid.maxShip, 'var(--chart-2)'),
                          }}
                        >
                          {fmtShipments(row.cell.avgShipments)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {view === 'week' && weekGrid.weeks.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              ISO weeks by year — avg spend and avg shipments per active day. Empty cells had no invoice activity.
            </p>
            <div
              className="max-h-[min(28rem,50vh)] overflow-auto rounded-md border border-border"
              tabIndex={0}
              role="region"
              aria-label="Week of year matrix"
            >
              <table className="w-full table-fixed border-collapse text-xs">
                <MatrixColGroup years={yearsForWeek} />
                <thead className="sticky top-0 z-10 bg-card shadow-sm">
                  {yearGroupHeader(yearsForWeek, 'Week')}
                </thead>
                <tbody>{weekGrid.weeks.map((week) => renderWeekRow(week))}</tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
