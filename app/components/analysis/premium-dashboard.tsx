'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Measures = {
  totalCost: number
  totalPackages: number
  packageDedupeShipmentCount?: number
  fuelCost: number
  costSurcharges: number
  costAccessorials?: number
  weightGap: number
}

type Summary = {
  totalRows: number
  measures: Measures
  monthlySpend?: Array<{
    month: string
    totalCost: number
    costFuel?: number
    costAccessorials?: number
    costSurcharges?: number
  }>
}

type AnalysisHistoryItem = {
  id: string
  invoice_upload_id: string
  updated_at: string
  summary: Summary & Record<string, unknown>
}

export function PremiumDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([])
  /** Fast load from DB (GET) */
  const [loadingCached, setLoadingCached] = useState(true)
  /** Full recompute (POST) — can take a long time with many CSVs */
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True when KPIs come from saved DB row, not a fresh POST */
  const [fromCache, setFromCache] = useState(false)

  const loadHistory = useCallback(async (): Promise<AnalysisHistoryItem[]> => {
    const res = await fetch('/api/invoices/analyze', { method: 'GET' })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || 'Failed to load analysis history.')
    }
    const list = (json.analyses as AnalysisHistoryItem[]) ?? []
    setHistory(list)
    return list
  }, [])

  /** Initial page load: read cached summary only (fast). Avoids timeouts from re-parsing every CSV. */
  const loadCachedSummary = useCallback(async () => {
    setLoadingCached(true)
    setError(null)
    try {
      const list = await loadHistory()
      const latest = list[0]
      if (latest?.summary?.measures) {
        setSummary({
          totalRows: latest.summary.totalRows ?? 0,
          measures: latest.summary.measures,
        })
        setFromCache(true)
      } else {
        setSummary(null)
        setFromCache(false)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analysis.')
    } finally {
      setLoadingCached(false)
    }
  }, [loadHistory])

  /** Recompute everything from uploaded CSVs (slow). Use after new uploads or when you need fresh totals. */
  async function refreshAnalysis() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/invoices/analyze', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to refresh analysis.')
      }
      setSummary(json.summary)
      setFromCache(false)
      await loadHistory()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to refresh analysis.')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadCachedSummary()
  }, [loadCachedSummary])

  const measures = summary?.measures
  const monthlyTotals = (summary?.monthlySpend ?? []).reduce(
    (acc, row) => {
      acc.totalCost += row.totalCost ?? 0
      acc.costFuel += row.costFuel ?? 0
      acc.costAccessorials += row.costAccessorials ?? 0
      acc.costSurcharges += row.costSurcharges ?? 0
      return acc
    },
    { totalCost: 0, costFuel: 0, costAccessorials: 0, costSurcharges: 0 }
  )

  return (
    <div className="min-h-svh w-full bg-background px-4 py-8 text-foreground sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-wide text-accent">Premium Analysis</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              High-level cost and volume metrics based on invoice CSVs you upload on this page.
            </p>
            {fromCache && summary ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing your last saved analysis (fast). Use &quot;Refresh analysis&quot; to recompute from all
                uploads — that step can take a while with many large CSVs.
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="border-accent/40 bg-background text-accent hover:bg-accent/10"
            onClick={refreshAnalysis}
            disabled={loadingCached || refreshing}
          >
            {refreshing ? 'Recomputing…' : 'Refresh analysis'}
          </Button>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        {loadingCached && !error ? (
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Loading saved analysis…
          </div>
        ) : null}

        {!loadingCached && !summary && !error ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            <p className="mb-3">
              No saved analysis yet.{' '}
              <a
                href="#premium-invoice-upload"
                className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Upload one or more invoice CSV files
              </a>{' '}
              above, then run analysis here once uploads are stored.
            </p>
            <Button
              variant="outline"
              className="border-border bg-background text-foreground hover:bg-muted"
              onClick={refreshAnalysis}
              disabled={refreshing}
            >
              {refreshing ? 'Computing…' : 'Run analysis from uploads'}
            </Button>
          </div>
        ) : null}

        {summary && measures ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Total Cost</CardTitle>
                <CardDescription>Σ Net Amount</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {measures.totalCost.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Total Packages</CardTitle>
                <CardDescription>
                  Sum of package qty once per shipment (deduped by invoice + tracking / shipment ref). Charge
                  lines no longer multiply-count.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {measures.totalPackages.toLocaleString()}
                </div>
                {typeof measures.packageDedupeShipmentCount === 'number' ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Distinct shipments in package total:{' '}
                    {measures.packageDedupeShipmentCount.toLocaleString()}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Fuel Cost</CardTitle>
                <CardDescription>Net Amount where mapping Category 2 = Fuel Surcharge</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {measures.fuelCost.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Cost – Surcharges</CardTitle>
                <CardDescription>
                  Net Amount where mapping Category 1 is Fuel Surcharge or Accessorial Surcharge
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {measures.costSurcharges.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Cost – Accessorials</CardTitle>
                <CardDescription>
                  Net Amount where Charge Classification Code = ACC and Charge Category Code not INF/ICC
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {(measures.costAccessorials ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Weight Gap</CardTitle>
                <CardDescription>Σ Billed Weight – Σ Entered Weight</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {measures.weightGap.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/25 bg-card">
              <CardHeader>
                <CardTitle>Rows Analyzed</CardTitle>
                <CardDescription>Number of invoice lines across all uploads</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {summary.totalRows.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {summary?.monthlySpend?.length ? (
          <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <CardHeader>
              <CardTitle>Spend by Month</CardTitle>
              <CardDescription>DAX-aligned monthly measures</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                tabIndex={0}
                role="region"
                aria-label="Spend by month table (horizontal scroll area)"
              >
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-medium">Month</th>
                      <th className="px-3 py-2 font-medium">Total Cost</th>
                      <th className="px-3 py-2 font-medium">Cost - Fuel</th>
                      <th className="px-3 py-2 font-medium">Cost - Accessorials</th>
                      <th className="px-3 py-2 font-medium">Cost - Surcharges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.monthlySpend.map((row) => (
                      <tr key={row.month} className="border-b border-border">
                        <td className="px-3 py-2 text-foreground">{row.month}</td>
                        <td className="px-3 py-2 text-foreground">
                          {row.totalCost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {(row.costFuel ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {(row.costAccessorials ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {(row.costSurcharges ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="px-3 py-2 text-foreground">Totals</td>
                      <td className="px-3 py-2 text-foreground">
                        {monthlyTotals.totalCost.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {monthlyTotals.costFuel.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {monthlyTotals.costAccessorials.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {monthlyTotals.costSurcharges.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {history.length ? (
          <Card className="border-accent/25 bg-card">
            <CardHeader>
              <CardTitle>Analyzed CSV History</CardTitle>
              <CardDescription>
                All analyzed uploads for your user, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium">Upload ID: {item.invoice_upload_id}</div>
                      <div className="text-xs text-muted-foreground">
                        Updated: {new Date(item.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <div>
                        <div className="text-muted-foreground">Rows</div>
                        <div className="text-foreground">{item.summary?.totalRows ?? 0}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total Cost</div>
                        <div className="text-foreground">
                          {item.summary?.measures?.totalCost?.toFixed(2) ?? '0.00'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Fuel</div>
                        <div className="text-foreground">
                          {item.summary?.measures?.fuelCost?.toFixed(2) ?? '0.00'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Packages</div>
                        <div className="text-foreground">{item.summary?.measures?.totalPackages ?? 0}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

