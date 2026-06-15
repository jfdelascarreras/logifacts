'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type CppRow = {
  label: string
  totalVolume: number
  totalCpp: number
  totalCost: number
}

type WeightBucketRow = {
  weightBucket: string
  totalVolume: number
  totalCost: number
  totalCpp: number
}

function fmtVolume(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function fmtCpp(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtCost(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function fmtK(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return fmtVolume(value)
}

/** e.g. BASE FREIGHT → Base Freight, UNMAPPED → Unmapped */
function formatChargeTypeLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed || trimmed === 'UNMAPPED') return 'Unmapped'
  return trimmed
    .toLowerCase()
    .split(/[\s_/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function MetricBar({
  label,
  value,
  max,
  color,
  formatted,
}: {
  label: string
  value: number
  max: number
  color: string
  formatted: string
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
        />
      </div>
      <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-foreground">{formatted}</span>
    </div>
  )
}

function CppVolumePanel({
  title,
  description,
  points,
  volumeColor,
  cppColor,
}: {
  title: string
  description: string
  points: CppRow[]
  volumeColor: string
  cppColor: string
}) {
  const top = points.slice(0, 8)
  if (!top.length) return null

  const maxVol = Math.max(1, ...top.map((p) => p.totalVolume))
  const maxCpp = Math.max(0.01, ...top.map((p) => p.totalCpp))
  const highestCpp = top.reduce((best, p) => (p.totalCpp > best.totalCpp ? p : best), top[0]!)

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: volumeColor }} />
            Package volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: cppColor }} />
            CPP (cost per package)
          </span>
        </div>

        <div className="space-y-5">
          {top.map((point) => {
            const isHighCpp = point.label === highestCpp.label && point.totalCpp > 0
            return (
              <div
                key={point.label}
                className={cn(
                  'rounded-lg border border-transparent px-1 py-0.5',
                  isHighCpp && 'border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20'
                )}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground" title={point.label}>
                      {point.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtCost(point.totalCost)} total spend</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge variant="secondary" className="tabular-nums">
                      {fmtVolume(point.totalVolume)} pkgs
                    </Badge>
                    <Badge
                      variant={isHighCpp ? 'destructive' : 'outline'}
                      className="tabular-nums"
                      title="Cost per package"
                    >
                      {fmtCpp(point.totalCpp)}/pkg
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <MetricBar
                    label="Vol"
                    value={point.totalVolume}
                    max={maxVol}
                    color={volumeColor}
                    formatted={fmtVolume(point.totalVolume)}
                  />
                  <MetricBar
                    label="CPP"
                    value={point.totalCpp}
                    max={maxCpp}
                    color={cppColor}
                    formatted={fmtCpp(point.totalCpp)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function WeightBucketPanel({ points }: { points: WeightBucketRow[] }) {
  if (!points.length) return null

  const maxVol = Math.max(1, ...points.map((p) => p.totalVolume))
  const maxCpp = Math.max(0.01, ...points.map((p) => p.totalCpp))

  return (
    <Card className="border-border bg-card lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Volume &amp; CPP by weight bucket</CardTitle>
        <CardDescription>
          Package volume (bars) and cost per package by billed weight tier. CPP bars use an independent scale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {points.map((point) => {
            const volPct = Math.max(point.totalVolume > 0 ? 8 : 0, (point.totalVolume / maxVol) * 100)
            const cppPct = Math.max(point.totalCpp > 0 ? 8 : 0, (point.totalCpp / maxCpp) * 100)
            return (
              <div
                key={point.weightBucket}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/10 p-2.5"
              >
                <p className="text-center text-xs font-semibold text-foreground">{point.weightBucket}</p>
                <div className="flex w-full max-w-[4.5rem] items-end justify-center gap-1.5">
                  <div className="flex h-28 flex-1 flex-col justify-end rounded-md bg-muted/40 p-1" title="Volume">
                    <div
                      className="w-full rounded-sm transition-[height] duration-300"
                      style={{ height: `${volPct}%`, backgroundColor: 'var(--chart-1)', opacity: 0.9 }}
                    />
                  </div>
                  <div className="flex h-28 flex-1 flex-col justify-end rounded-md bg-muted/40 p-1" title="CPP">
                    <div
                      className="w-full rounded-sm transition-[height] duration-300"
                      style={{ height: `${cppPct}%`, backgroundColor: 'var(--chart-2)', opacity: 0.9 }}
                    />
                  </div>
                </div>
                <div className="w-full space-y-0.5 text-center">
                  <p className="text-[10px] tabular-nums text-muted-foreground">{fmtK(point.totalVolume)} pkgs</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{fmtCpp(point.totalCpp)}</p>
                  <p className="text-[10px] text-muted-foreground">CPP</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm bg-[var(--chart-1)]" />
            Volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm bg-[var(--chart-2)]" />
            CPP
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function CreativeVisualsGrid({
  category2VolumeCpp,
  modeVolumeCpp,
  weightBucketVolume,
}: {
  category2VolumeCpp: Array<{ category2: string; totalVolume: number; totalCpp: number; totalCost: number }>
  modeVolumeCpp: Array<{ mode: string; totalVolume: number; totalCpp: number; totalCost: number }>
  weightBucketVolume: Array<{
    weightBucket: string
    totalVolume: number
    totalCost?: number
    totalCpp?: number
  }>
}) {
  const hasCategory2 = category2VolumeCpp.length > 0
  const hasMode = modeVolumeCpp.length > 0
  const hasWeight = weightBucketVolume.length > 0

  if (!hasCategory2 && !hasMode && !hasWeight) return null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasCategory2 ? (
        <CppVolumePanel
          title="Spend by charge type — volume & CPP"
          description="Package volume and cost per package by charge type (e.g. base freight, fuel, surcharges) from your invoice mapping."
          points={category2VolumeCpp.map((x) => ({
            label: formatChargeTypeLabel(x.category2),
            totalVolume: x.totalVolume,
            totalCpp: x.totalCpp,
            totalCost: x.totalCost,
          }))}
          volumeColor="var(--chart-1)"
          cppColor="var(--chart-2)"
        />
      ) : null}
      {hasMode ? (
        <CppVolumePanel
          title="Mode — volume & CPP"
          description="Ground vs air (zone-derived). Compare volume mix against unit cost (CPP) per mode."
          points={modeVolumeCpp.map((x) => ({
            label: x.mode,
            totalVolume: x.totalVolume,
            totalCpp: x.totalCpp,
            totalCost: x.totalCost,
          }))}
          volumeColor="var(--chart-3)"
          cppColor="var(--chart-4)"
        />
      ) : null}
      {hasWeight ? (
        <WeightBucketPanel
          points={weightBucketVolume.map((x) => ({
            weightBucket: x.weightBucket,
            totalVolume: x.totalVolume,
            totalCost: x.totalCost ?? 0,
            totalCpp: x.totalCpp ?? 0,
          }))}
        />
      ) : null}
    </div>
  )
}
