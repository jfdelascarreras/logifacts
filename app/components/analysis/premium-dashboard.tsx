'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CostTrendGrid } from '@/app/components/analysis/cost-trend-grid'
import { CreativeVisualsGrid } from '@/app/components/analysis/creative-visuals-grid'
import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import {
  hasActiveInvoiceFilters,
  isInvoiceYearMonthKey,
  mergeInvoiceAnalysisFilterMeta,
  normalizedMonthNumbers,
  type InvoiceAnalysisFilterMeta,
  type InvoiceAnalysisFilters,
} from '@/lib/invoices/analysis-summary'
import { cn } from '@/lib/utils'

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
  dailySpend?: Array<{
    date: string
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  category2VolumeCpp?: Array<{
    category2: string
    totalVolume: number
    totalCpp: number
    totalCost: number
  }>
  modeVolumeCpp?: Array<{
    mode: string
    totalVolume: number
    totalCpp: number
    totalCost: number
  }>
  weightBucketVolume?: Array<{
    weightBucket: string
    sort: number
    totalVolume: number
    totalCost: number
    totalCpp: number
  }>
  spendByInvoice?: Array<{
    accountNumber: string
    invoiceNumber: string
    invoiceDate: string | null
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  dailySpendByAccount?: Array<{
    date: string
    accountNumber: string
    totalCost: number
    costFuel: number
    costAccessorials: number
    costSurcharges: number
  }>
  filterMeta?: InvoiceAnalysisFilterMeta
  appliedFilters?: InvoiceAnalysisFilters
}

type AnalysisHistoryItem = {
  id: string
  invoice_upload_id: string
  updated_at: string
  summary: Summary & Record<string, unknown>
}

const emptyFilterMeta: InvoiceAnalysisFilterMeta = {
  years: [],
  yearMonths: [],
  accountNumbers: [],
}

function formatCalendarMonthLong(monthNum: number): string {
  return new Date(Date.UTC(2000, monthNum - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
}

function buildFiltersBody(
  yearStr: string,
  months: number[],
  accountStr: string
): InvoiceAnalysisFilters {
  const f: InvoiceAnalysisFilters = {}
  if (yearStr) {
    const y = Number(yearStr)
    if (Number.isFinite(y)) f.year = y
  }
  const uniqMonths = normalizedMonthNumbers(months)
  if (uniqMonths.length) f.months = uniqMonths
  const acc = accountStr.trim()
  if (acc) f.accountNumber = acc
  return f
}

type ApplySummaryOptions = {
  /**
   * When true, copy `appliedFilters` from the summary into the filter UI.
   * Callers should set this only when the **request** included active filters (e.g. `hasActiveInvoiceFilters(filters)` on POST),
   * so unfiltered POSTs never repopulate controls from a stale `applied_filters` payload.
   */
  hydrateFiltersFromApplied?: boolean
}

export function PremiumDashboard() {
  const pathname = usePathname()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([])
  const [filterMeta, setFilterMeta] = useState<InvoiceAnalysisFilterMeta>(emptyFilterMeta)
  const [filterYear, setFilterYear] = useState('')
  /** Distinct calendar months (1–12) present in invoice data for the selected year (or all years). */
  const [filterMonths, setFilterMonths] = useState<number[]>([])
  const [filterAccount, setFilterAccount] = useState('')
  const [detailByInvoice, setDetailByInvoice] = useState(false)
  /** Full recompute / filter apply — can take a long time with many CSVs */
  const [refreshing, setRefreshing] = useState(false)
  /** Distinguish filter POST vs full refresh for messaging and button labels. */
  const [analysisPostIntent, setAnalysisPostIntent] = useState<'idle' | 'filters' | 'full-refresh'>('idle')
  /** Fast load from DB (GET) */
  const [loadingCached, setLoadingCached] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** True when KPIs come from saved DB row, not a fresh POST */
  const [fromCache, setFromCache] = useState(false)

  const loadHistory = useCallback(async (): Promise<AnalysisHistoryItem[]> => {
    const res = await fetch('/api/invoices/analyze', { method: 'GET', cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || 'Failed to load analysis history.')
    }
    const list = (json.analyses as AnalysisHistoryItem[]) ?? []
    setHistory(list)
    return list
  }, [])

  /** Clear filter widgets whenever this page is shown (covers client navigations + remounts). */
  useEffect(() => {
    if (!pathname?.includes('premium-analysis')) return
    setFilterYear('')
    setFilterMonths([])
    setFilterAccount('')
  }, [pathname])

  /** Initial page load: read cached summary only (fast). Avoids timeouts from re-parsing every CSV. */
  const applySummaryPayload = useCallback((raw: Summary & Record<string, unknown>, options?: ApplySummaryOptions) => {
    if (!raw?.measures) return
    const r = raw as Record<string, unknown>
    const fm = (raw.filterMeta ?? r.filter_meta) as InvoiceAnalysisFilterMeta | undefined
    const fmPartial =
      fm && Array.isArray(fm.years) && Array.isArray(fm.yearMonths) && Array.isArray(fm.accountNumbers) ? fm : undefined
    const dailySpend = (Array.isArray(raw.dailySpend) ? raw.dailySpend : Array.isArray(r.daily_spend) ? r.daily_spend : []) as NonNullable<Summary['dailySpend']>
    const monthlySpend = (Array.isArray(raw.monthlySpend)
      ? raw.monthlySpend
      : Array.isArray(r.monthly_spend)
        ? r.monthly_spend
        : []) as NonNullable<Summary['monthlySpend']>
    const spendByInvoice = (Array.isArray(raw.spendByInvoice)
      ? raw.spendByInvoice
      : Array.isArray(r.spend_by_invoice)
        ? r.spend_by_invoice
        : []) as NonNullable<Summary['spendByInvoice']>
    const dailySpendByAccount = (Array.isArray(raw.dailySpendByAccount)
      ? raw.dailySpendByAccount
      : Array.isArray(r.daily_spend_by_account)
        ? r.daily_spend_by_account
        : []) as NonNullable<Summary['dailySpendByAccount']>
    const mergedFilterMeta = mergeInvoiceAnalysisFilterMeta(fmPartial, {
      dailySpend,
      monthlySpend,
      spendByInvoice,
      dailySpendByAccount,
    })
    setFilterMeta(mergedFilterMeta)
    const applied = (raw.appliedFilters ?? r.applied_filters) as InvoiceAnalysisFilters | undefined
    const hydrateFilters =
      options?.hydrateFiltersFromApplied === true &&
      Boolean(applied && typeof applied === 'object' && hasActiveInvoiceFilters(applied))
    if (hydrateFilters && applied && typeof applied === 'object') {
      const ym =
        typeof applied.yearMonth === 'string' && isInvoiceYearMonthKey(applied.yearMonth)
          ? applied.yearMonth
          : ''
      if (ym) {
        setFilterYear(ym.slice(0, 4))
        setFilterMonths([Number(ym.slice(5, 7))])
      } else {
        setFilterYear(applied.year != null && Number.isFinite(Number(applied.year)) ? String(applied.year) : '')
        setFilterMonths(normalizedMonthNumbers(applied.months))
      }
      setFilterAccount(typeof applied.accountNumber === 'string' ? applied.accountNumber : '')
    } else {
      setFilterYear('')
      setFilterMonths([])
      setFilterAccount('')
    }
    setSummary({
      totalRows: Number(raw.totalRows ?? r.total_rows ?? 0),
      measures: raw.measures,
      monthlySpend,
      dailySpend,
      category2VolumeCpp: (Array.isArray(raw.category2VolumeCpp)
        ? raw.category2VolumeCpp
        : Array.isArray(r.category2_volume_cpp)
          ? r.category2_volume_cpp
          : []) as NonNullable<Summary['category2VolumeCpp']>,
      modeVolumeCpp: (Array.isArray(raw.modeVolumeCpp)
        ? raw.modeVolumeCpp
        : Array.isArray(r.mode_volume_cpp)
          ? r.mode_volume_cpp
          : []) as NonNullable<Summary['modeVolumeCpp']>,
      weightBucketVolume: (Array.isArray(raw.weightBucketVolume)
        ? raw.weightBucketVolume
        : Array.isArray(r.weight_bucket_volume)
          ? r.weight_bucket_volume
          : []) as NonNullable<Summary['weightBucketVolume']>,
      spendByInvoice,
      dailySpendByAccount,
      filterMeta: mergedFilterMeta,
      appliedFilters: applied,
    })
  }, [])

  const loadCachedSummary = useCallback(async () => {
    setLoadingCached(true)
    setError(null)
    try {
      const list = await loadHistory()
      const latest = list[0]
      if (latest?.summary?.measures) {
        applySummaryPayload(latest.summary as Summary & Record<string, unknown>, {
          hydrateFiltersFromApplied: false,
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
  }, [applySummaryPayload, loadHistory])

  async function postAnalysis(
    filters: InvoiceAnalysisFilters | undefined,
    intent: 'filters' | 'full-refresh'
  ) {
    setRefreshing(true)
    setAnalysisPostIntent(intent)
    setError(null)
    try {
      const res = await fetch('/api/invoices/analyze', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters != null && Object.keys(filters).length > 0 ? { filters } : {}),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to refresh analysis.')
      }
      if (json.summary?.measures) {
        applySummaryPayload(json.summary as Summary & Record<string, unknown>, {
          hydrateFiltersFromApplied: hasActiveInvoiceFilters(filters),
        })
        setFromCache(false)
      }
      await loadHistory()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to refresh analysis.')
    } finally {
      setRefreshing(false)
      setAnalysisPostIntent('idle')
    }
  }

  /** Recompute everything from uploaded CSVs (slow). Clears dashboard filters. */
  async function refreshAnalysis() {
    setFilterYear('')
    setFilterMonths([])
    setFilterAccount('')
    await postAnalysis(undefined, 'full-refresh')
  }

  async function applyFilters() {
    await postAnalysis(buildFiltersBody(filterYear, filterMonths, filterAccount), 'filters')
  }

  async function clearFilters() {
    setFilterYear('')
    setFilterMonths([])
    setFilterAccount('')
    await postAnalysis(undefined, 'filters')
  }

  const invoiceMonthChoices = useMemo(() => {
    const yms = filterMeta.yearMonths ?? []
    const list = filterYear ? yms.filter((ym) => ym.startsWith(`${filterYear}-`)) : yms
    const monthsSet = new Set<number>()
    for (const ym of list) {
      if (typeof ym === 'string' && ym.length >= 7) {
        const mo = Number(ym.slice(5, 7))
        if (mo >= 1 && mo <= 12) monthsSet.add(mo)
      }
    }
    return Array.from(monthsSet).sort((a, b) => a - b)
  }, [filterMeta.yearMonths, filterYear])

  useEffect(() => {
    setFilterMonths((prev) => prev.filter((m) => invoiceMonthChoices.includes(m)))
  }, [invoiceMonthChoices])

  const toggleFilterMonth = useCallback((m: number) => {
    setFilterMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)
    )
  }, [])

  useEffect(() => {
    void loadCachedSummary()
  }, [loadCachedSummary])

  /** After upload, the CSV card runs POST /analyze and dispatches this — update dashboard without a second click. */
  useEffect(() => {
    function onPremiumAnalysisUpdated(e: Event) {
      const ce = e as CustomEvent<{ summary?: unknown }>
      const raw = ce.detail?.summary as (Summary & Record<string, unknown>) | undefined
      if (raw?.measures) {
        applySummaryPayload(raw, { hydrateFiltersFromApplied: false })
        setFromCache(false)
        void loadHistory()
      }
    }
    window.addEventListener(PREMIUM_ANALYSIS_UPDATED, onPremiumAnalysisUpdated)
    return () => window.removeEventListener(PREMIUM_ANALYSIS_UPDATED, onPremiumAnalysisUpdated)
  }, [applySummaryPayload, loadHistory])

  const measures = summary?.measures
  const invoiceTotals = (summary?.spendByInvoice ?? []).reduce(
    (acc, row) => {
      acc.totalCost += row.totalCost ?? 0
      acc.costFuel += row.costFuel ?? 0
      acc.costAccessorials += row.costAccessorials ?? 0
      acc.costSurcharges += row.costSurcharges ?? 0
      return acc
    },
    { totalCost: 0, costFuel: 0, costAccessorials: 0, costSurcharges: 0 }
  )

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
                Showing your last saved analysis from the server. New uploads trigger analysis automatically; use{' '}
                <span className="font-medium text-foreground">Refresh analysis</span> for a manual full recompute when
                you need it.
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="border-accent/40 bg-background text-accent hover:bg-accent/10"
            onClick={refreshAnalysis}
            disabled={loadingCached || refreshing}
          >
            {refreshing && analysisPostIntent === 'full-refresh' ? 'Recomputing…' : 'Refresh analysis'}
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

        {summary && measures ? (
          <Card className="border-accent/25 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>
                Years, months, and account numbers come from your invoice CSVs. Optionally pick a year to limit which
                calendar months appear. Select one or more months by name. Unfiltered analysis writes daily spend to
                Supabase split by account; filtered runs only refresh the saved JSON summary here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {refreshing && analysisPostIntent === 'filters' ? (
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground"
                >
                  <Loader2 className="size-5 shrink-0 animate-spin text-accent" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">Applying filters</p>
                    <p className="text-muted-foreground">
                      Recalculating metrics and charts — this can take a few seconds.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="premium-filter-year">Year</Label>
                  <select
                    id="premium-filter-year"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    disabled={refreshing}
                  >
                    <option value="">All years</option>
                    {filterMeta.years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="premium-filter-account">Account number</Label>
                  <select
                    id="premium-filter-account"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={filterAccount}
                    onChange={(e) => setFilterAccount(e.target.value)}
                    disabled={refreshing}
                  >
                    <option value="">All accounts</option>
                    {filterMeta.accountNumbers.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="space-y-1">
                    <Label id="premium-filter-months-label">Months (invoice data)</Label>
                    <p id="premium-filter-months-hint" className="max-w-xl text-xs text-muted-foreground">
                      Tap a month to toggle. Which years apply follows the year filter (all years = that month in any
                      year you have data for).
                    </p>
                  </div>
                  {invoiceMonthChoices.length > 0 ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={refreshing}
                        onClick={() => setFilterMonths([...invoiceMonthChoices])}
                      >
                        All months
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={refreshing}
                        onClick={() => setFilterMonths([])}
                      >
                        Clear months
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-labelledby="premium-filter-months-label"
                  aria-describedby="premium-filter-months-hint"
                  className="rounded-lg border border-border bg-muted/15 p-2 sm:p-3"
                >
                  {invoiceMonthChoices.length === 0 ? (
                    <p className="px-1 py-6 text-center text-sm text-muted-foreground">No invoice months in uploads</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {invoiceMonthChoices.map((m) => {
                        const selected = filterMonths.includes(m)
                        return (
                          <label
                            key={m}
                            className={cn(
                              'relative flex min-h-12 cursor-pointer select-none items-center justify-center rounded-md border px-2 py-2.5 text-center text-sm font-medium leading-tight transition-colors motion-reduce:transition-none',
                              selected
                                ? 'border-accent bg-accent/15 text-foreground shadow-sm ring-1 ring-accent/25'
                                : 'border-border bg-background text-muted-foreground hover:border-accent/35 hover:bg-muted/60 hover:text-foreground',
                              refreshing && 'pointer-events-none opacity-50'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={selected}
                              onChange={() => toggleFilterMonth(m)}
                              disabled={refreshing}
                              aria-label={`${formatCalendarMonthLong(m)}${selected ? ', selected' : ''}`}
                            />
                            <span className="pointer-events-none">{formatCalendarMonthLong(m)}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              {filterMeta.years.length === 0 && !refreshing ? (
                <p className="text-xs text-muted-foreground">
                  Year and month lists are built from invoice dates in your uploads. If this is empty, use{' '}
                  <span className="font-medium text-foreground">Refresh analysis</span> once so the server can attach
                  filter metadata to your saved summary.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => void applyFilters()}
                  disabled={loadingCached || refreshing}
                >
                  {refreshing && analysisPostIntent === 'filters' ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Applying filters…
                    </span>
                  ) : (
                    'Apply filters'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => void clearFilters()} disabled={refreshing}>
                  {refreshing && analysisPostIntent === 'filters' ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Clearing…
                    </span>
                  ) : (
                    'Clear filters'
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border border-input accent-accent"
                    checked={detailByInvoice}
                    onChange={(e) => setDetailByInvoice(e.target.checked)}
                  />
                  Detail by invoice
                </label>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loadingCached && !error ? (
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Loading saved analysis…
          </div>
        ) : null}

        {!loadingCached && !summary && !error ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            <p>
              No saved analysis yet.{' '}
              <a
                href="#premium-invoice-upload"
                className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Upload invoice CSV files
              </a>{' '}
              above — we analyze automatically after each successful upload. If you already have uploads but no
              analysis row, use{' '}
              <span className="font-medium text-foreground">Refresh analysis</span> at the top to recompute manually.
            </p>
          </div>
        ) : null}

        {summary && measures ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <CardHeader>
                <CardTitle>Total Cost</CardTitle>
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

          </div>
        ) : null}

        {summary?.monthlySpend?.length ? (
          <Card className="border-accent/25 bg-card transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <CardHeader>
              <CardTitle>Spend by Month</CardTitle>
              <CardDescription>Monthly spend trends</CardDescription>
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

        {detailByInvoice && summary?.spendByInvoice?.length ? (
          <Card className="border-accent/25 bg-card">
            <CardHeader>
              <CardTitle>Spend by invoice</CardTitle>
              <CardDescription>Same cost splits as the monthly table, rolled up per UPS invoice.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="max-h-[min(28rem,55vh)] overflow-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                tabIndex={0}
                role="region"
                aria-label="Spend by invoice table"
              >
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground shadow-sm">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-medium">Invoice date</th>
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 font-medium">Invoice #</th>
                      <th className="px-3 py-2 font-medium">Total cost</th>
                      <th className="px-3 py-2 font-medium">Cost – fuel</th>
                      <th className="px-3 py-2 font-medium">Cost – accessorials</th>
                      <th className="px-3 py-2 font-medium">Cost – surcharges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.spendByInvoice.map((row) => (
                      <tr key={`${row.accountNumber}-${row.invoiceNumber}`} className="border-b border-border">
                        <td className="px-3 py-2 text-foreground">{row.invoiceDate ?? '—'}</td>
                        <td className="px-3 py-2 text-foreground">{row.accountNumber}</td>
                        <td className="px-3 py-2 text-foreground">{row.invoiceNumber}</td>
                        <td className="px-3 py-2 text-foreground">
                          {row.totalCost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {row.costFuel.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {row.costAccessorials.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {row.costSurcharges.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="px-3 py-2 text-foreground" colSpan={3}>
                        Totals
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {invoiceTotals.totalCost.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {invoiceTotals.costFuel.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {invoiceTotals.costAccessorials.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {invoiceTotals.costSurcharges.toLocaleString(undefined, {
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

        {summary?.dailySpend?.length ? <CostTrendGrid dailySpend={summary.dailySpend} /> : null}

        {summary?.category2VolumeCpp?.length &&
        summary?.modeVolumeCpp?.length &&
        summary?.weightBucketVolume?.length ? (
          <CreativeVisualsGrid
            category2VolumeCpp={summary.category2VolumeCpp}
            modeVolumeCpp={summary.modeVolumeCpp}
            weightBucketVolume={summary.weightBucketVolume}
          />
        ) : null}

        {(() => {
          const latestInvoices = history[0]?.summary?.spendByInvoice
          if (!Array.isArray(latestInvoices) || latestInvoices.length === 0) return null
          return (
            <Card className="border-accent/25 bg-card">
              <CardHeader>
                <CardTitle>Invoices Analyzed</CardTitle>
                <CardDescription>
                  {latestInvoices.length.toLocaleString()} invoice{latestInvoices.length !== 1 ? 's' : ''} from the latest run · {new Date(history[0].updated_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  tabIndex={0}
                  role="region"
                  aria-label="Invoices analyzed table"
                >
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 font-medium">Invoice #</th>
                        <th className="px-3 py-2 font-medium">Invoice Date</th>
                        <th className="px-3 py-2 font-medium text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestInvoices.map((inv) => (
                        <tr key={`${inv.accountNumber}-${inv.invoiceNumber}`} className="border-b border-border">
                          <td className="px-3 py-2 font-medium text-foreground">{inv.invoiceNumber}</td>
                          <td className="px-3 py-2 text-muted-foreground">{inv.invoiceDate ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {inv.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td className="px-3 py-2 text-foreground" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right text-foreground">
                          {latestInvoices
                            .reduce((sum, inv) => sum + (inv.totalCost ?? 0), 0)
                            .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )
        })()}
      </div>
    </div>
  )
}

