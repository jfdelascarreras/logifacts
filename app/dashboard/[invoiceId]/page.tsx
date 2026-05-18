'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CarrierBreakdown } from '@/app/components/dashboard/CarrierBreakdown'
import { ChargeTypeBar } from '@/app/components/dashboard/ChargeTypeBar'
import { CategoryDrilldown } from '@/app/components/dashboard/CategoryDrilldown'
import { MonthlyTrend } from '@/app/components/dashboard/MonthlyTrend'
import { UnmappedCharges } from '@/app/components/dashboard/UnmappedCharges'
import { InvoiceTable } from '@/app/components/dashboard/InvoiceTable'
import type { AnalysisFilters, InvoiceLine, Carrier } from '@/types/invoice'

function buildQuery(invoiceId: string, filters: AnalysisFilters): string {
  const params = new URLSearchParams({ invoiceId })
  filters.carrier?.forEach((c) => params.append('carrier', c))
  filters.standardized_charge?.forEach((c) => params.append('standardized_charge', c))
  filters.category_1?.forEach((c) => params.append('category_1', c))
  filters.mapped !== undefined && params.set('mapped', String(filters.mapped))
  return `/api/invoices/analysis?${params.toString()}`
}

export default function DashboardPage() {
  const params = useParams()
  const invoiceId = params.invoiceId as string

  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AnalysisFilters>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'lines' | 'unmatched'>('overview')
  const [carrier, setCarrier] = useState<Carrier>('UPS')

  const fetchLines = useCallback(async (f: AnalysisFilters) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(buildQuery(invoiceId, f))
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      setLines(json.data ?? [])
      if (json.data?.length) setCarrier((json.data[0] as InvoiceLine).carrier)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { fetchLines(filters) }, [fetchLines, filters])

  const totalSpend = lines.reduce((s, l) => s + l.charge_amount, 0)
  const unmappedCount = lines.filter((l) => !l.mapped).length

  // KPI measures — formulas match the Python dashboard script exactly
  // Fuel: category_3 == "FUEL SURCHARGE"
  const fuelCost = lines.reduce((s, l) =>
    s + (l.category_3?.toUpperCase() === 'FUEL SURCHARGE' ? l.charge_amount : 0), 0)

  // Accessorials: classification == ACC AND category NOT IN [INF, ICC]
  const accessorialCost = lines.reduce((s, l) => {
    const cls = l.charge_classification_code?.toUpperCase()
    const cat = l.charge_category_code?.toUpperCase()
    return s + (cls === 'ACC' && cat !== 'INF' && cat !== 'ICC' ? l.charge_amount : 0)
  }, 0)

  // Surcharges: category_3 in [FUEL SURCHARGE, ACCESSORIAL SURCHARGE, SURCHARGE]
  const SURCHARGE_CATS = new Set(['FUEL SURCHARGE', 'ACCESSORIAL SURCHARGE', 'SURCHARGE'])
  const surchargeCost = lines.reduce((s, l) =>
    s + (SURCHARGE_CATS.has(l.category_3?.toUpperCase() ?? '') ? l.charge_amount : 0), 0)

  // Total Volume: sum of package_quantity (not row count)
  const totalVolume = lines.reduce((s, l) => s + (l.package_quantity ?? 0), 0)

  function pct(n: number, d: number) {
    return d ? `${((n / d) * 100).toFixed(1)}%` : '—'
  }
  function money(n: number) {
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  function toggleFilter(key: keyof AnalysisFilters, value: unknown) {
    setFilters((prev) => {
      if (key === 'mapped') {
        return { ...prev, mapped: prev.mapped === (value as boolean) ? undefined : (value as boolean) }
      }
      const arr = (prev[key] as string[] | undefined) ?? []
      const strVal = String(value)
      const next = arr.includes(strVal) ? arr.filter((v) => v !== strVal) : [...arr, strVal]
      return { ...prev, [key]: next.length ? next : undefined }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-xs">{carrier}</Badge>
            <span className="text-sm font-medium text-muted-foreground">Invoice Analysis</span>
          </div>
          <div className="flex items-center gap-2">
            {unmappedCount > 0 && (
              <Badge variant="destructive" className="text-xs">{unmappedCount} unmatched</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              asChild
            >
              <a href={`/api/invoices/export/${invoiceId}`} download>
                Export Excel
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fetchLines(filters)}>
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Cost',      value: money(totalSpend) },
            { label: 'Fuel Cost',       value: `${money(fuelCost)}  (${pct(fuelCost, totalSpend)})` },
            { label: 'Accessorials',    value: `${money(accessorialCost)}  (${pct(accessorialCost, totalSpend)})` },
            { label: 'Surcharges',      value: `${money(surchargeCost)}  (${pct(surchargeCost, totalSpend)})` },
            { label: 'Total Volume',    value: totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
            { label: 'Total Lines',     value: lines.length.toLocaleString() },
            { label: 'Mapped',          value: `${lines.length - unmappedCount}` },
            { label: 'Unmatched',       value: `${unmappedCount}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold leading-tight">{loading ? <Skeleton className="h-6 w-20 mt-1" /> : value}</p>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        {Object.keys(filters).length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {filters.carrier?.map((c) => (
              <Badge key={c} variant="secondary" className="cursor-pointer text-xs" onClick={() => toggleFilter('carrier', c)}>
                {c} ×
              </Badge>
            ))}
            {filters.category_1?.map((c) => (
              <Badge key={c} variant="secondary" className="cursor-pointer text-xs" onClick={() => toggleFilter('category_1', c)}>
                {c} ×
              </Badge>
            ))}
            {filters.mapped !== undefined && (
              <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => toggleFilter('mapped', filters.mapped)}>
                {filters.mapped ? 'mapped only' : 'unmatched only'} ×
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilters({})}>
              Clear all
            </Button>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {(['overview', 'lines', 'unmatched'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
              {tab === 'unmatched' && unmappedCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1">{unmappedCount}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : activeTab === 'overview' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CarrierBreakdown lines={lines} />
              <ChargeTypeBar lines={lines} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CategoryDrilldown lines={lines} />
              <MonthlyTrend lines={lines} />
            </div>
          </div>
        ) : activeTab === 'lines' ? (
          <InvoiceTable lines={lines} />
        ) : (
          <UnmappedCharges
            lines={lines}
            invoiceId={invoiceId}
            carrier={carrier}
            onMappingSaved={() => fetchLines(filters)}
          />
        )}
      </main>
    </div>
  )
}
