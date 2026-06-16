'use client'

import { paper } from '@/app/components/analysis/premium-paper-styles'
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
      <span className="w-8 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className={paper.barTrack}>
        <div
          className={paper.barFill}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-foreground">{formatted}</span>
    </div>
  )
}

function CppVolumePanel({
  figureLabel,
  title,
  description,
  points,
  volumeColor,
  cppColor,
}: {
  figureLabel: string
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

  return (
    <section className={paper.section}>
      <header className={paper.sectionHeader}>
        <h3 className={paper.sectionTitle}>
          <span className={paper.sectionNumber}>{figureLabel}</span>
          {title}
        </h3>
        <p className={paper.sectionDesc}>{description}</p>
      </header>
      <div className={paper.sectionBody}>
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 border-b border-border pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3" style={{ backgroundColor: volumeColor }} />
            Package volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3" style={{ backgroundColor: cppColor }} />
            Cost per package (CPP)
          </span>
        </div>

        <div className="space-y-4">
          {top.map((point) => (
              <div key={point.label} className="border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground" title={point.label}>
                      {point.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtCost(point.totalCost)} total spend</p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <div>{fmtVolume(point.totalVolume)} pkgs</div>
                    <div className="font-medium text-foreground">{fmtCpp(point.totalCpp)}/pkg</div>
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
            ))}
        </div>
      </div>
    </section>
  )
}

function WeightBucketPanel({ points }: { points: WeightBucketRow[] }) {
  if (!points.length) return null

  const maxVol = Math.max(1, ...points.map((p) => p.totalVolume))
  const maxCpp = Math.max(0.01, ...points.map((p) => p.totalCpp))

  return (
    <section className={cn(paper.section, 'lg:col-span-2')}>
      <header className={paper.sectionHeader}>
        <h3 className={paper.sectionTitle}>
          <span className={paper.sectionNumber}>Figure 3.</span>
          Volume and CPP by weight bucket
        </h3>
        <p className={paper.sectionDesc}>
          Adjacent bars show package volume and cost per package by billed weight tier; CPP scale is independent.
        </p>
      </header>
      <div className={paper.sectionBody}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {points.map((point) => {
            const volPct = Math.max(point.totalVolume > 0 ? 8 : 0, (point.totalVolume / maxVol) * 100)
            const cppPct = Math.max(point.totalCpp > 0 ? 8 : 0, (point.totalCpp / maxCpp) * 100)
            return (
              <div
                key={point.weightBucket}
                className="flex flex-col items-center gap-2 border border-border bg-background p-2"
              >
                <p className="text-center text-xs font-medium text-foreground">{point.weightBucket}</p>
                <div className="flex w-full max-w-[4.5rem] items-end justify-center gap-1">
                  <div className="flex h-28 flex-1 flex-col justify-end border border-border/60 bg-muted/20 p-0.5" title="Volume">
                    <div
                      className="w-full transition-[height] duration-300 motion-reduce:transition-none"
                      style={{ height: `${volPct}%`, backgroundColor: 'var(--chart-1)' }}
                    />
                  </div>
                  <div className="flex h-28 flex-1 flex-col justify-end border border-border/60 bg-muted/20 p-0.5" title="CPP">
                    <div
                      className="w-full transition-[height] duration-300 motion-reduce:transition-none"
                      style={{ height: `${cppPct}%`, backgroundColor: 'var(--chart-2)' }}
                    />
                  </div>
                </div>
                <div className="w-full space-y-0.5 text-center">
                  <p className="text-[10px] tabular-nums text-muted-foreground">{fmtK(point.totalVolume)} pkgs</p>
                  <p className="text-sm font-medium tabular-nums text-foreground">{fmtCpp(point.totalCpp)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">CPP</p>
                </div>
              </div>
            )
          })}
        </div>
        <p className={cn(paper.figureNote, 'mt-3 text-center not-italic')}>
          <span className="mr-4 inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 bg-[var(--chart-1)]" />
            Volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 bg-[var(--chart-2)]" />
            CPP
          </span>
        </p>
      </div>
    </section>
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
          figureLabel="Figure 2a."
          title="Spend by charge type: volume and CPP"
          description="Package volume and unit cost by mapped charge type (base freight, fuel, surcharges, etc.)."
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
          figureLabel="Figure 2b."
          title="Mode: volume and CPP"
          description="Ground versus air (zone-derived). Volume mix compared to cost per package by mode."
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
