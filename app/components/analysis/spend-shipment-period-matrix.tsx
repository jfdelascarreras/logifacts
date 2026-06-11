'use client'

import { useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SpendShipmentPeriodMatrix } from '@/lib/invoices/period-averages-matrix'

type MatrixView = 'year' | 'month' | 'week'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtShipments(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function heatAlpha(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return 0.08 + 0.42 * (value / max)
}

type CellData = { avgSpend: number; avgShipments: number }

function DualMetricCells({
  cell,
  maxSpend,
  maxShip,
  spendColorVar,
  shipColorVar,
}: {
  cell: CellData | undefined
  maxSpend: number
  maxShip: number
  spendColorVar: string
  shipColorVar: string
}) {
  if (!cell || (cell.avgSpend <= 0 && cell.avgShipments <= 0)) {
    return (
      <>
        <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">—</td>
        <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">—</td>
      </>
    )
  }

  const spendAlpha = heatAlpha(cell.avgSpend, maxSpend)
  const shipAlpha = heatAlpha(cell.avgShipments, maxShip)

  return (
    <>
      <td
        className="px-2 py-1.5 text-center tabular-nums text-foreground"
        style={{
          backgroundColor:
            spendAlpha > 0
              ? `color-mix(in srgb, ${spendColorVar} ${Math.round(spendAlpha * 100)}%, transparent)`
              : undefined,
        }}
      >
        ${fmtMoney(cell.avgSpend)}
      </td>
      <td
        className="px-2 py-1.5 text-center tabular-nums text-foreground"
        style={{
          backgroundColor:
            shipAlpha > 0
              ? `color-mix(in srgb, ${shipColorVar} ${Math.round(shipAlpha * 100)}%, transparent)`
              : undefined,
        }}
      >
        {fmtShipments(cell.avgShipments)}
      </td>
    </>
  )
}

type Props = {
  matrix: SpendShipmentPeriodMatrix
}

export function SpendShipmentPeriodMatrixCard({ matrix }: Props) {
  const [view, setView] = useState<MatrixView>('month')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const years = useMemo(
    () => [...matrix.years].sort((a, b) => a - b),
    [matrix.years]
  )

  const byYearSorted = useMemo(
    () => [...matrix.byYear].sort((a, b) => a.year - b.year),
    [matrix.byYear]
  )

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

  if (!years.length) return null

  const yearGroupHeader = (
    <>
      <tr>
        <th
          rowSpan={2}
          className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium text-muted-foreground align-bottom"
        >
          {view === 'week' ? 'Week' : 'Month'}
        </th>
        {years.map((y) => (
          <th
            key={y}
            colSpan={2}
            className="border-b border-border px-2 py-1.5 text-center text-xs font-semibold text-foreground"
          >
            {y}
          </th>
        ))}
      </tr>
      <tr>
        {years.flatMap((y) => [
          <th
            key={`${y}-spend`}
            className="px-2 py-1 text-center text-[10px] font-medium text-muted-foreground"
          >
            Avg spend
          </th>,
          <th
            key={`${y}-ship`}
            className="px-2 py-1 text-center text-[10px] font-medium text-muted-foreground"
          >
            Avg ship.
          </th>,
        ])}
      </tr>
    </>
  )

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
            <span className="text-xs text-muted-foreground">
              <span className="inline-block size-2 rounded-sm bg-[var(--chart-1)] opacity-60 align-middle" /> Spend
              <span className="mx-2" />
              <span className="inline-block size-2 rounded-sm bg-[var(--chart-2)] opacity-60 align-middle" /> Shipments
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {view === 'year' ? (
          <div className="overflow-x-auto rounded-md" tabIndex={0} role="region" aria-label="Year averages table">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-muted-foreground">
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
                  <tr key={row.year} className="border-b border-border">
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

        {view === 'month' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Rows are months — each year has avg spend and avg shipments columns
            </p>
            <div className="overflow-x-auto rounded-md" tabIndex={0} role="region" aria-label="Month year matrix">
              <table className="w-full min-w-[480px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-card">{yearGroupHeader}</thead>
                <tbody>
                  {MONTH_SHORT.map((label, idx) => {
                    const month = idx + 1
                    return (
                      <tr key={label} className="border-t border-border/50">
                        <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium text-foreground">
                          {label}
                        </td>
                        {years.flatMap((y) => {
                          const cell = monthGrid.map.get(`${y}-${month}`)
                          return (
                            <DualMetricCells
                              key={`${y}-${month}`}
                              cell={cell}
                              maxSpend={monthGrid.maxSpend}
                              maxShip={monthGrid.maxShip}
                              spendColorVar="var(--chart-1)"
                              shipColorVar="var(--chart-2)"
                            />
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'week' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Rows are ISO weeks — each year has avg spend and avg shipments columns
            </p>
            <div
              className="max-h-[min(28rem,50vh)] overflow-auto rounded-md"
              tabIndex={0}
              role="region"
              aria-label="Week of year matrix"
            >
              <table className="w-full min-w-[480px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-card shadow-sm">{yearGroupHeader}</thead>
                <tbody>
                  {weekGrid.weeks.map((week) => (
                    <tr key={week} className="border-t border-border/50">
                      <td className="sticky left-0 z-10 bg-card px-2 py-1 font-medium text-foreground">
                        W{String(week).padStart(2, '0')}
                      </td>
                      {years.flatMap((y) => {
                        const cell = weekGrid.map.get(`${y}-${week}`)
                        return (
                          <DualMetricCells
                            key={`${y}-${week}`}
                            cell={cell}
                            maxSpend={weekGrid.maxSpend}
                            maxShip={weekGrid.maxShip}
                            spendColorVar="var(--chart-1)"
                            shipColorVar="var(--chart-2)"
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
