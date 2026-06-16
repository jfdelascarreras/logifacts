'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'

function fmtUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

type Props = {
  diagnostics: PremiumParseIngestDiagnostics
  totalCost?: number
}

export function DataHealthCard({ diagnostics, totalCost }: Props) {
  const mappedPct =
    diagnostics.linesTotal > 0
      ? (diagnostics.linesMapped / diagnostics.linesTotal) * 100
      : 100
  const unmappedPctOfSpend =
    totalCost != null && totalCost > 0
      ? (diagnostics.unmappedSpend / totalCost) * 100
      : 0
  const trackingPct =
    diagnostics.shipmentsTotal > 0
      ? ((diagnostics.shipmentsTotal - diagnostics.shipmentsWithoutTracking) /
          diagnostics.shipmentsTotal) *
        100
      : 100

  const warnings: string[] = []
  if (unmappedPctOfSpend > 5) {
    warnings.push(
      `${fmtPct(unmappedPctOfSpend)} of spend (${fmtUSD(diagnostics.unmappedSpend)}) is unmapped — taxonomy may need updates.`
    )
  }
  if (trackingPct < 90 && diagnostics.shipmentsTotal > 0) {
    warnings.push(
      `${diagnostics.shipmentsWithoutTracking} shipment(s) lack tracking — package counts may be understated.`
    )
  }
  if (diagnostics.rowsDroppedCriticalSciCorruption > 0) {
    warnings.push(
      `${diagnostics.rowsDroppedCriticalSciCorruption} row(s) excluded due to corrupted identifier fields.`
    )
  }

  return (
    <Card className={warnings.length ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Data health</CardTitle>
        <CardDescription>
          Ingest quality for this analysis run — mapping coverage, tracking, and parser versions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Charge lines</p>
          <p className="font-medium tabular-nums">{diagnostics.linesTotal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Mapped</p>
          <p className="font-medium tabular-nums">
            {fmtPct(mappedPct)} ({diagnostics.linesMapped.toLocaleString()})
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Shipments w/ tracking</p>
          <p className="font-medium tabular-nums">
            {fmtPct(trackingPct)} ({diagnostics.shipmentsTotal.toLocaleString()} total)
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Parser versions</p>
          <p className="font-medium">
            {diagnostics.parseVersions.length
              ? diagnostics.parseVersions.join(', ')
              : 'legacy'}
          </p>
        </div>
        {warnings.length ? (
          <ul className="sm:col-span-2 lg:col-span-4 list-disc space-y-1 pl-4 text-amber-900 dark:text-amber-100">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="sm:col-span-2 lg:col-span-4 text-muted-foreground">
            Coverage looks good for this dataset.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
