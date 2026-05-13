'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ComboPoint = {
  label: string
  totalVolume: number
  totalCpp: number
}

type WeightBucketPoint = {
  weightBucket: string
  totalVolume: number
}

function formatNum(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}

function formatK(value: number): string {
  return `${(value / 1000).toFixed(1)}K`
}

function ComboVolumeCppChart({
  title,
  points,
  barColor,
  lineColor,
}: {
  title: string
  points: ComboPoint[]
  barColor: string
  lineColor: string
}) {
  const top = points.slice(0, 8)
  const maxVol = Math.max(1, ...top.map((p) => p.totalVolume))
  const maxCpp = Math.max(1, ...top.map((p) => p.totalCpp))

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {top.map((point) => {
            const volPct = (point.totalVolume / maxVol) * 100
            const cppPct = (point.totalCpp / maxCpp) * 100
            return (
              <div
                key={point.label}
                className="space-y-1"
                title={`${point.label}\nVolume: ${formatNum(point.totalVolume)}\nCPP: ${formatNum(point.totalCpp)}`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{point.label}</span>
                  <span className="text-foreground">
                    V {formatNum(point.totalVolume)} | CPP {formatNum(point.totalCpp)}
                  </span>
                </div>
                <div className="relative h-8 rounded-md bg-muted/30">
                  <div
                    className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-sm"
                    style={{ width: `${volPct}%`, background: barColor, opacity: 0.55 }}
                  />
                  <div
                    className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full"
                    style={{ left: `${cppPct}%`, background: lineColor }}
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

function WeightBucketBarChart({ points }: { points: WeightBucketPoint[] }) {
  const maxVol = Math.max(1, ...points.map((p) => p.totalVolume))
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Total Volume by Weight Bucket</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:grid-cols-7">
          {points.map((point) => {
            const pct = (point.totalVolume / maxVol) * 100
            return (
              <div key={point.weightBucket} className="flex flex-col items-center gap-2 rounded-md border border-border p-2">
                <div className="text-center text-muted-foreground">{point.weightBucket}</div>
                <div className="flex h-28 w-8 items-end rounded-md bg-muted/30 p-1">
                  <div
                    className="w-full rounded-sm"
                    style={{ height: `${Math.max(5, pct)}%`, background: 'var(--chart-5)', opacity: 0.95 }}
                    title={`${point.weightBucket}\nTotal Volume: ${formatNum(point.totalVolume)}`}
                  />
                </div>
                <div className="font-medium text-foreground">{formatK(point.totalVolume)}</div>
              </div>
            )
          })}
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
  category2VolumeCpp: Array<{ category2: string; totalVolume: number; totalCpp: number }>
  modeVolumeCpp: Array<{ mode: string; totalVolume: number; totalCpp: number }>
  weightBucketVolume: Array<{ weightBucket: string; totalVolume: number }>
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ComboVolumeCppChart
        title="Category2 — Volume + CPP"
        points={category2VolumeCpp.map((x) => ({
          label: x.category2,
          totalVolume: x.totalVolume,
          totalCpp: x.totalCpp,
        }))}
        barColor="var(--chart-1)"
        lineColor="var(--chart-2)"
      />
      <ComboVolumeCppChart
        title="Mode — Volume + CPP"
        points={modeVolumeCpp.map((x) => ({ label: x.mode, totalVolume: x.totalVolume, totalCpp: x.totalCpp }))}
        barColor="var(--chart-3)"
        lineColor="var(--chart-4)"
      />
      <div className="lg:col-span-2">
        <WeightBucketBarChart points={weightBucketVolume} />
      </div>
    </div>
  )
}
