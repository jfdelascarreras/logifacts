'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import { ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CostForecastCard } from '@/app/components/analysis/cost-forecast-card'
import { CostTrendGrid } from '@/app/components/analysis/cost-trend-grid'
import { MomWaterfall } from '@/app/components/analysis/mom-waterfall'
import { CreativeVisualsGrid } from '@/app/components/analysis/creative-visuals-grid'
import { AgentsFindingsPanel } from '@/app/components/analysis/agents-findings-panel'
import { DataHealthCard } from '@/app/components/analysis/data-health-card'
import { IngestAlertsCard } from '@/app/components/analysis/ingest-alerts-card'
import { SpendShipmentPeriodMatrixCard } from '@/app/components/analysis/spend-shipment-period-matrix'
import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'
import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import { identifierLooksScientificNotationCorrupted } from '@/lib/invoices/identifier-safety'
import {
  hasActiveInvoiceFilters,
  isInvoiceYearMonthKey,
  mergeInvoiceAnalysisFilterMeta,
  normalizedMonthNumbers,
  type InvoiceAnalysisFilterMeta,
  type InvoiceAnalysisFilters,
} from '@/lib/premium-analysis/analysis-summary'
import type { SpendShipmentPeriodMatrix } from '@/lib/premium-analysis/period-averages-matrix'
import { paper, paperTableCell, paperTableHeadCell } from '@/app/components/analysis/premium-paper-styles'
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
  /** Spend totals by carrier — present when multi-carrier invoices exist. */
  spendByCarrier?: Array<{ carrier: string; totalCost: number }>
  filterMeta?: InvoiceAnalysisFilterMeta
  appliedFilters?: InvoiceAnalysisFilters
  ingestDiagnostics?: PremiumParseIngestDiagnostics
  periodMatrix?: SpendShipmentPeriodMatrix
  specCategories?: import('@/lib/premium-analysis/spec-categories').SpecCategoriesSummary
  carrierMix?: import('@/lib/premium-analysis/agents-types').CarrierMixRow[]
  anomalyFlags?: import('@/lib/premium-analysis/agents-types').AnomalyFlag[]
  savingsEstimate?: import('@/lib/premium-analysis/agents-types').SavingsEstimate
  actionItems?: import('@/lib/premium-analysis/agents-types').ActionItem[]
  datasetFlags?: import('@/lib/premium-analysis/agents-types').DatasetFlags
  ingestQuality?: import('@/lib/premium-analysis/ingest-quality').IngestQualityGate
  ingestSource?: 'invoice_rows' | 'legacy'
  staleIngest?: import('@/lib/premium-analysis/stale-ingest').StaleIngestAlert
  runRegression?: import('@/lib/premium-analysis/analysis-regression').RunRegression
}

type AnalysisHistoryItem = {
  id: string
  invoice_upload_id: string
  updated_at: string
  summary: Summary & Record<string, unknown>
}

function SummaryStatisticsTable({
  measures,
  packageDedupeShipmentCount,
}: {
  measures: Measures
  packageDedupeShipmentCount?: number
}) {
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const rows: Array<{ label: string; value: string; note?: string }> = [
    { label: 'Total cost', value: fmt(measures.totalCost) },
    {
      label: 'Total packages',
      value: measures.totalPackages.toLocaleString(),
      note:
        typeof packageDedupeShipmentCount === 'number'
          ? `${packageDedupeShipmentCount.toLocaleString()} distinct shipments`
          : undefined,
    },
    { label: 'Fuel cost', value: fmt(measures.fuelCost) },
    { label: 'Surcharges', value: fmt(measures.costSurcharges) },
    { label: 'Accessorials', value: fmt(measures.costAccessorials ?? 0) },
    { label: 'Weight gap', value: fmt(measures.weightGap) },
  ]

  return (
    <section className={paper.section} aria-labelledby="premium-summary-stats">
      <header className={paper.sectionHeader}>
        <h2 id="premium-summary-stats" className={paper.sectionTitle}>
          <span className={paper.sectionNumber}>Table 1.</span>
          Summary statistics
        </h2>
        <p className={paper.sectionDesc}>
          Aggregate measures for the filtered invoice sample. All monetary values in USD.
        </p>
      </header>
      <div className={paper.sectionBody}>
        <div className={paper.tableWrap} tabIndex={0} role="region" aria-label="Summary statistics">
          <table className={paper.table}>
            <thead className={paper.tableHead}>
              <tr>
                <th className={paperTableHeadCell()}>Measure</th>
                <th className={paperTableHeadCell(true)}>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className={paperTableCell(false, true)}>{row.label}</td>
                  <td className={paperTableCell(true)}>
                    {row.value}
                    {row.note ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.note}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
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
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  /** True when KPIs come from saved DB row, not a fresh POST */
  const [fromCache, setFromCache] = useState(false)
  const [invoicesExpanded, setInvoicesExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'analysis' | 'forecast'>('analysis')
  /** Files in Invoices Uploaded — used to avoid "no analysis" when data exists. */
  const [storedUploadCount, setStoredUploadCount] = useState(0)
  const autoAnalyzeOnce = useRef(false)

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
    const ingestRaw = raw.ingestDiagnostics ?? r.ingest_diagnostics
    let ingestDiagnostics: Summary['ingestDiagnostics'] = undefined
    if (ingestRaw && typeof ingestRaw === 'object') {
      const ig = ingestRaw as Record<string, unknown>
      const num = (k: string, snake: string) => {
        const v = ig[k] ?? ig[snake]
        return typeof v === 'number' ? v : undefined
      }
      const dupUp = num('duplicateUploadRowsSkipped', 'duplicate_upload_rows_skipped')
      const dupCh = num('duplicateChargeRowsDropped', 'duplicate_charge_rows_dropped')
      const sci = num('rowsDroppedCriticalSciCorruption', 'rows_dropped_critical_sci_corruption')
      const linesTotal = num('linesTotal', 'lines_total')
      const linesMapped = num('linesMapped', 'lines_mapped')
      const unmappedSpend = num('unmappedSpend', 'unmapped_spend')
      const shipmentsTotal = num('shipmentsTotal', 'shipments_total')
      const shipmentsWithoutTracking = num('shipmentsWithoutTracking', 'shipments_without_tracking')
      const linesMissingShipDate = num('linesMissingShipDate', 'lines_missing_ship_date')
      const parseVersionsRaw = ig.parseVersions ?? ig.parse_versions
      const parseVersions = Array.isArray(parseVersionsRaw)
        ? parseVersionsRaw.filter((v): v is string => typeof v === 'string')
        : []
      if (
        dupUp != null &&
        dupCh != null &&
        sci != null &&
        linesTotal != null &&
        linesMapped != null &&
        unmappedSpend != null &&
        shipmentsTotal != null &&
        shipmentsWithoutTracking != null &&
        linesMissingShipDate != null
      ) {
        ingestDiagnostics = {
          duplicateUploadRowsSkipped: dupUp,
          duplicateChargeRowsDropped: dupCh,
          rowsDroppedCriticalSciCorruption: sci,
          linesTotal,
          linesMapped,
          unmappedSpend,
          shipmentsTotal,
          shipmentsWithoutTracking,
          linesMissingShipDate,
          parseVersions,
        }
      } else if (dupUp != null && dupCh != null && sci != null) {
        ingestDiagnostics = {
          duplicateUploadRowsSkipped: dupUp,
          duplicateChargeRowsDropped: dupCh,
          rowsDroppedCriticalSciCorruption: sci,
          linesTotal: 0,
          linesMapped: 0,
          unmappedSpend: 0,
          shipmentsTotal: 0,
          shipmentsWithoutTracking: 0,
          linesMissingShipDate: 0,
          parseVersions: [],
        }
      }
    }
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
    // Build spendByCarrier from the byCarrier map stored in the summary JSON.
    const byCarrierRaw = (raw.byCarrier ?? r.byCarrier) as Record<string, { totalNetAmount?: number }> | undefined
    const spendByCarrier: Summary['spendByCarrier'] =
      byCarrierRaw && typeof byCarrierRaw === 'object'
        ? Object.entries(byCarrierRaw)
            .map(([carrier, v]) => ({ carrier, totalCost: v?.totalNetAmount ?? 0 }))
            .filter((x) => x.totalCost !== 0)
            .sort((a, b) => b.totalCost - a.totalCost)
        : undefined

    const periodMatrix = (raw.periodMatrix ?? r.period_matrix) as SpendShipmentPeriodMatrix | undefined

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
      spendByCarrier,
      filterMeta: mergedFilterMeta,
      appliedFilters: applied,
      ingestDiagnostics,
      periodMatrix,
      specCategories: (raw.specCategories ?? r.spec_categories) as Summary['specCategories'],
      carrierMix: (raw.carrierMix ?? r.carrier_mix) as Summary['carrierMix'],
      anomalyFlags: (raw.anomalyFlags ?? r.anomaly_flags) as Summary['anomalyFlags'],
      savingsEstimate: (raw.savingsEstimate ?? r.savings_estimate) as Summary['savingsEstimate'],
      actionItems: (raw.actionItems ?? r.action_items) as Summary['actionItems'],
      datasetFlags: (raw.datasetFlags ?? r.dataset_flags) as Summary['datasetFlags'],
      ingestQuality: (raw.ingestQuality ?? r.ingest_quality) as Summary['ingestQuality'],
      ingestSource: (raw.ingestSource ?? r.ingest_source) as Summary['ingestSource'],
      staleIngest: (raw.staleIngest ?? r.stale_ingest) as Summary['staleIngest'],
      runRegression: (raw.runRegression ?? r.run_regression) as Summary['runRegression'],
    })
  }, [])

  const loadCachedSummary = useCallback(async () => {
    setLoadingCached(true)
    setError(null)
    setRefreshWarning(null)
    try {
      const [list, uploadsRes] = await Promise.all([
        loadHistory(),
        fetch('/api/invoices/uploads', { cache: 'no-store' }).then(
          (r) => r.json() as Promise<{ uploads?: unknown[] }>
        ),
      ])
      const uploadCount = uploadsRes.uploads?.length ?? 0
      setStoredUploadCount(uploadCount)

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
    setRefreshWarning(null)
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
        setRefreshWarning(null)
      }
      await loadHistory()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to refresh analysis.'
      if (summary?.measures) {
        setRefreshWarning(msg)
        setError(null)
      } else {
        setError(msg)
        setRefreshWarning(null)
      }
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

  async function exportPremiumExcel() {
    setExporting(true)
    setError(null)
    try {
      const filters = buildFiltersBody(filterYear, filterMonths, filterAccount)
      const body = Object.keys(filters).length > 0 ? { filters } : {}
      const res = await fetch('/api/invoices/analyze/export', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `premium-analysis_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
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

  /** Uploaded files exist but no saved summary — run one combined analysis automatically. */
  useEffect(() => {
    if (loadingCached || summary || storedUploadCount === 0 || autoAnalyzeOnce.current) return
    autoAnalyzeOnce.current = true
    void postAnalysis(undefined, 'full-refresh')
  }, [loadingCached, summary, storedUploadCount])

  /** After upload, the CSV card runs POST /analyze and dispatches this — update dashboard without a second click. */
  useEffect(() => {
    function onPremiumAnalysisUpdated(e: Event) {
      const ce = e as CustomEvent<{ summary?: unknown; cleared?: boolean }>
      if (ce.detail?.cleared) {
        setSummary(null)
        setFromCache(false)
        void loadHistory()
        return
      }
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
  const hasActiveFilters = !!(filterYear || filterMonths.length || filterAccount)
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

  const accountBreakdown = useMemo(() => {
    const rows = summary?.dailySpendByAccount ?? []
    if (rows.length === 0) return []
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.accountNumber, (map.get(row.accountNumber) ?? 0) + row.totalCost)
    }
    const grandTotal = Array.from(map.values()).reduce((s, v) => s + v, 0)
    return Array.from(map.entries())
      .map(([accountNumber, totalCost]) => ({
        accountNumber,
        totalCost,
        pct: grandTotal > 0 ? (totalCost / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
  }, [summary?.dailySpendByAccount])

  function exportSpendByInvoiceToCsv(invoices: NonNullable<Summary['spendByInvoice']>, runDate: string) {
    const fmt = (n: number) => n.toFixed(2)
    const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
    const headers = ['Account Number', 'Invoice #', 'Invoice Date', 'Total Cost', 'Cost - Fuel', 'Cost - Accessorials', 'Cost - Surcharges']
    const rows = invoices.map((inv) => [
      escape(inv.accountNumber),
      escape(inv.invoiceNumber),
      escape(inv.invoiceDate ?? ''),
      fmt(inv.totalCost),
      fmt(inv.costFuel),
      fmt(inv.costAccessorials),
      fmt(inv.costSurcharges),
    ])
    const totalRow = [
      'Total', '', '',
      fmt(invoices.reduce((s, i) => s + i.totalCost, 0)),
      fmt(invoices.reduce((s, i) => s + i.costFuel, 0)),
      fmt(invoices.reduce((s, i) => s + i.costAccessorials, 0)),
      fmt(invoices.reduce((s, i) => s + i.costSurcharges, 0)),
    ]
    const csv = [headers, ...rows, totalRow].map((r) => r.join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-analyzed-${runDate.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={cn(paper.root, 'min-h-svh w-full bg-background px-4 py-8 sm:py-10')}>
      <div className={paper.page}>
        <header className="border-b border-border pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className={paper.docTitle}>Premium Analysis</h1>
              <p className={paper.docSubtitle}>
                Invoice-level cost and volume aggregates computed from uploaded carrier files. Figures and tables
                below follow standard summary-statistics conventions; filters restrict the sample without altering
                column definitions.
              </p>
              {fromCache && summary ? (
                <p className={paper.docMeta}>
                  Cached run from server storage. Use <span className="text-foreground">Refresh analysis</span> to
                  recompute the full multi-file dataset.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 font-sans">
              <Button
                variant="outline"
                className={paper.btnOutline}
                onClick={exportPremiumExcel}
                disabled={loadingCached || exporting || refreshing}
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
            <Button
              variant="outline"
              className={paper.btnOutline}
              onClick={refreshAnalysis}
              disabled={loadingCached || refreshing || exporting}
            >
              {refreshing && analysisPostIntent === 'full-refresh' ? 'Recomputing…' : 'Refresh analysis'}
            </Button>
          </div>
          </div>
        </header>

        {error ? (
          <div role="alert" className={cn(paper.alert, paper.alertError, 'font-sans')}>
            {error}
          </div>
        ) : null}

        {refreshWarning ? (
          <div
            role="status"
            className={cn(paper.alert, 'font-sans flex items-start justify-between gap-3 border-amber-600/30 bg-amber-50/50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100')}
          >
            <p>
              <span className="font-medium">Refresh did not complete.</span> Showing your last saved analysis.{' '}
              {refreshWarning}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 px-2 text-amber-950 hover:bg-amber-500/20 dark:text-amber-100"
              onClick={() => setRefreshWarning(null)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        {summary?.ingestDiagnostics ? (
          <DataHealthCard
            diagnostics={summary.ingestDiagnostics}
            totalCost={measures?.totalCost}
          />
        ) : null}

        {summary ? (
          <IngestAlertsCard
            ingestSource={summary.ingestSource}
            staleIngest={summary.staleIngest}
            runRegression={summary.runRegression}
          />
        ) : null}

        {summary && measures ? (
          <section className={paper.section} aria-labelledby="premium-filters">
            <header className={paper.sectionHeader}>
              <h2 id="premium-filters" className={paper.sectionTitle}>
                <span className={paper.sectionNumber}>§1</span>
                Sample filters
              </h2>
              <p className={paper.sectionDesc}>
                Restrict the analysis sample by year, calendar month, or account. Unfiltered runs persist daily spend
                by account in storage; filtered runs update the in-memory summary only.
              </p>
            </header>
            <div className={cn(paper.sectionBody, 'flex flex-col gap-4 font-sans')}>
              {refreshing && analysisPostIntent === 'filters' ? (
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  className={cn(paper.alert, 'flex items-center gap-3')}
                >
                  <Loader2 className="size-4 shrink-0 animate-spin text-foreground" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">Applying filters</p>
                    <p className="text-muted-foreground">Recalculating tables and figures.</p>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="premium-filter-year">Year</Label>
                  <select
                    id="premium-filter-year"
                    className={cn(paper.control, 'h-9 w-full px-3')}
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
                    className={cn(paper.control, 'h-9 w-full px-3')}
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
                  className="rounded-none border border-border bg-muted/15 p-2 sm:p-3"
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
                              paper.monthChip,
                              selected ? paper.monthChipSelected : paper.monthChipIdle,
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
                  className={paper.btnPrimary}
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
                <Button type="button" variant="outline" className={paper.btnOutline} onClick={() => void clearFilters()} disabled={refreshing}>
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
                    className="size-4 rounded-none border border-input accent-primary"
                    checked={detailByInvoice}
                    onChange={(e) => setDetailByInvoice(e.target.checked)}
                  />
                  Detail by invoice
                </label>
              </div>
            </div>
          </section>
        ) : null}

        {summary ? (
          <div className={paper.tabList} role="tablist" aria-label="Analysis views">
            {(['analysis', 'forecast'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(paper.tab, activeTab === tab && paper.tabActive, '-mb-px')}
              >
                {tab === 'analysis' ? 'Empirical results' : 'Forecast'}
              </button>
            ))}
          </div>
        ) : null}

        {loadingCached && !error ? (
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Loading saved analysis…
          </div>
        ) : null}

        {!loadingCached && !summary && !error && !refreshing ? (
          <div className={cn(paper.section, paper.sectionBody, 'text-sm text-muted-foreground')}>
            {storedUploadCount > 0 ? (
              <p>
                You have {storedUploadCount} uploaded file{storedUploadCount !== 1 ? 's' : ''} in{' '}
                <span className="font-medium text-foreground">Invoices Uploaded</span> below, but no saved combined
                analysis yet. Use{' '}
                <span className="font-medium text-foreground">Refresh analysis</span> to aggregate your full dataset.
              </p>
            ) : (
              <p>
                No invoice files yet.{' '}
                <a
                  href="#premium-invoice-upload"
                  className="text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Upload invoices
                </a>{' '}
                above (UPS CSV or FedEx/WWE Excel) — we run one combined Premium Analysis after all files in a batch finish uploading.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'analysis' && <>

        {summary && measures ? (
          <SummaryStatisticsTable
            measures={measures}
            packageDedupeShipmentCount={measures.packageDedupeShipmentCount}
          />
        ) : null}

        {summary?.spendByCarrier && summary.spendByCarrier.length > 1 ? (
          <section className={paper.section}>
            <header className={paper.sectionHeader}>
              <h2 className={paper.sectionTitle}>
                <span className={paper.sectionNumber}>Table 2.</span>
                Spend by carrier
              </h2>
              <p className={paper.sectionDesc}>Share of total net spend by carrier in the filtered sample.</p>
            </header>
            <div className={paper.sectionBody}>
              <div className={paper.tableWrap} tabIndex={0} role="region" aria-label="Spend by carrier table">
                <table className={paper.table}>
                  <thead className={paper.tableHead}>
                    <tr>
                      <th className={paperTableHeadCell()}>Carrier</th>
                      <th className={paperTableHeadCell(true)}>Total cost</th>
                      <th className={paperTableHeadCell(true)}>% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.spendByCarrier.map((row) => {
                      const grandTotal = summary.spendByCarrier!.reduce((s, r) => s + r.totalCost, 0)
                      const pct = grandTotal > 0 ? (row.totalCost / grandTotal) * 100 : 0
                      return (
                        <tr key={row.carrier}>
                          <td className={paperTableCell(false, true)}>{row.carrier}</td>
                          <td className={paperTableCell(true)}>
                            {row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={paperTableCell(true)}>{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={paper.tfoot}>
                      <td className={paperTableCell(false, true)}>Total</td>
                      <td className={paperTableCell(true)}>
                        {summary.spendByCarrier.reduce((s, r) => s + r.totalCost, 0)
                          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={paperTableCell(true)}>100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {accountBreakdown.length > 1 ? (
          <section className={paper.section}>
            <header className={paper.sectionHeader}>
              <h2 className={paper.sectionTitle}>
                <span className={paper.sectionNumber}>Table 3.</span>
                Cost by account
              </h2>
              <p className={paper.sectionDesc}>Total spend by UPS account number.</p>
            </header>
            <div className={paper.sectionBody}>
              <div
                className={cn(paper.tableWrap, 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
                tabIndex={0}
                role="region"
                aria-label="Cost by account table"
              >
                <table className={cn(paper.table, 'min-w-[360px]')}>
                  <thead className={paper.tableHead}>
                    <tr>
                      <th className={paperTableHeadCell()}>Account number</th>
                      <th className={paperTableHeadCell(true)}>Total cost</th>
                      <th className={paperTableHeadCell(true)}>% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountBreakdown.map((row) => {
                      const needsSciNotationReview = identifierLooksScientificNotationCorrupted(row.accountNumber)
                      return (
                      <tr key={row.accountNumber}>
                        <td className={paperTableCell(false, true)}>
                          <span>{row.accountNumber}</span>
                          {needsSciNotationReview && (
                            <span
                              className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-normal text-destructive"
                              title="This value matches the same float-like scientific notation pattern used during import cleanup. Confirm it against your UPS export; if a spreadsheet rewrote identifiers, export again with Account Number formatted as Text."
                            >
                              Looks like numeric sci notation — verify this account
                            </span>
                          )}
                        </td>
                        <td className={paperTableCell(true)}>
                          {row.totalCost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>{row.pct.toFixed(1)}%</td>
                      </tr>
                    )})}

                  </tbody>
                  <tfoot>
                    <tr className={paper.tfoot}>
                      <td className={paperTableCell(false, true)}>Total</td>
                      <td className={paperTableCell(true)}>
                        {accountBreakdown
                          .reduce((s, r) => s + r.totalCost, 0)
                          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={paperTableCell(true)}>100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {summary?.monthlySpend?.length ? (
          <section className={paper.section}>
            <header className={paper.sectionHeader}>
              <h2 className={paper.sectionTitle}>
                <span className={paper.sectionNumber}>Table 4.</span>
                Monthly spend decomposition
              </h2>
              <p className={paper.sectionDesc}>Total cost and component charges by calendar month.</p>
            </header>
            <div className={paper.sectionBody}>
              <div
                className={cn(paper.tableWrap, 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
                tabIndex={0}
                role="region"
                aria-label="Spend by month table"
              >
                <table className={cn(paper.table, 'min-w-[520px]')}>
                  <thead className={paper.tableHead}>
                    <tr>
                      <th className={paperTableHeadCell()}>Month</th>
                      <th className={paperTableHeadCell(true)}>Total cost</th>
                      <th className={paperTableHeadCell(true)}>Fuel</th>
                      <th className={paperTableHeadCell(true)}>Accessorials</th>
                      <th className={paperTableHeadCell(true)}>Surcharges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.monthlySpend.map((row) => (
                      <tr key={row.month}>
                        <td className={paperTableCell(false, true)}>{row.month}</td>
                        <td className={paperTableCell(true)}>
                          {row.totalCost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {(row.costFuel ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {(row.costAccessorials ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {(row.costSurcharges ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className={paper.tfoot}>
                      <td className={paperTableCell(false, true)}>Totals</td>
                      <td className={paperTableCell(true)}>
                        {monthlyTotals.totalCost.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {monthlyTotals.costFuel.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {monthlyTotals.costAccessorials.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {monthlyTotals.costSurcharges.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {(() => {
          // Prefer the current (possibly filtered) view when it has 2+ months so the
          // waterfall respects account filters. Fall back to the saved full-dataset
          // analysis only when the current summary is narrowed to a single month.
          const cur = summary?.monthlySpend
          const hist = history[0]?.summary?.monthlySpend
          const wm = cur && cur.length >= 2 ? cur : hist && hist.length >= 2 ? hist : null
          return wm ? <MomWaterfall monthlySpend={wm} /> : null
        })()}

        {detailByInvoice && summary?.spendByInvoice?.length ? (
          <section className={paper.section}>
            <header className={paper.sectionHeader}>
              <h2 className={paper.sectionTitle}>
                <span className={paper.sectionNumber}>Table A.1</span>
                Invoice-level detail
              </h2>
              <p className={paper.sectionDesc}>Cost decomposition rolled up to individual invoices (optional appendix).</p>
            </header>
            <div className={paper.sectionBody}>
              <div
                className={cn(paper.tableWrap, 'max-h-[min(28rem,55vh)] overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
                tabIndex={0}
                role="region"
                aria-label="Spend by invoice table"
              >
                <table className={cn(paper.table, 'min-w-[640px]')}>
                  <thead className={cn(paper.tableHead, 'sticky top-0 z-10 bg-card')}>
                    <tr>
                      <th className={paperTableHeadCell()}>Invoice date</th>
                      <th className={paperTableHeadCell()}>Account</th>
                      <th className={paperTableHeadCell()}>Invoice #</th>
                      <th className={paperTableHeadCell(true)}>Total cost</th>
                      <th className={paperTableHeadCell(true)}>Fuel</th>
                      <th className={paperTableHeadCell(true)}>Accessorials</th>
                      <th className={paperTableHeadCell(true)}>Surcharges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.spendByInvoice.map((row) => (
                      <tr key={`${row.accountNumber}-${row.invoiceNumber}`}>
                        <td className={paperTableCell()}>{row.invoiceDate ?? '—'}</td>
                        <td className={paperTableCell()}>{row.accountNumber}</td>
                        <td className={paperTableCell()}>{row.invoiceNumber}</td>
                        <td className={paperTableCell(true)}>
                          {row.totalCost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {row.costFuel.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {row.costAccessorials.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className={paperTableCell(true)}>
                          {row.costSurcharges.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                    <tr className={paper.tfoot}>
                      <td className={paperTableCell(false, true)} colSpan={3}>
                        Totals
                      </td>
                      <td className={paperTableCell(true)}>
                        {invoiceTotals.totalCost.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {invoiceTotals.costFuel.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {invoiceTotals.costAccessorials.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className={paperTableCell(true)}>
                        {invoiceTotals.costSurcharges.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {summary?.dailySpend?.length ? <CostTrendGrid dailySpend={summary.dailySpend} /> : null}

        {summary?.periodMatrix?.years?.length ? (
          <SpendShipmentPeriodMatrixCard matrix={summary.periodMatrix} />
        ) : null}

        <AgentsFindingsPanel summary={summary} />

        {(summary?.category2VolumeCpp?.length ||
          summary?.modeVolumeCpp?.length ||
          summary?.weightBucketVolume?.length) ? (
          <CreativeVisualsGrid
            category2VolumeCpp={summary.category2VolumeCpp ?? []}
            modeVolumeCpp={summary.modeVolumeCpp ?? []}
            weightBucketVolume={summary.weightBucketVolume ?? []}
          />
        ) : null}


        </>}

        {activeTab === 'forecast' && (
          summary?.monthlySpend?.length ? (
            <CostForecastCard monthlySpend={summary.monthlySpend} isFiltered={hasActiveFilters} />
          ) : (
            <p className="text-sm text-muted-foreground">Run an analysis first to see the forecast.</p>
          )
        )}
      </div>
    </div>
  )
}

