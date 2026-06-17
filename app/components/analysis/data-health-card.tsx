'use client'

import { paper } from '@/app/components/analysis/premium-paper-styles'
import { cn } from '@/lib/utils'
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
    <section className={cn(paper.section, warnings.length && 'border-amber-600/30')}>
      <header className={paper.sectionHeader}>
        <h2 className={paper.sectionTitle}>
          <span className={paper.sectionNumber}>§0</span>
          Data quality
        </h2>
        <p className={paper.sectionDesc}>
          Ingest diagnostics: mapping coverage, tracking completeness, and parser versions for this run.
        </p>
      </header>
      <div className={paper.sectionBody}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Charge lines</dt>
            <dd className="font-medium tabular-nums">{diagnostics.linesTotal.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Mapped</dt>
            <dd className="font-medium tabular-nums">
              {fmtPct(mappedPct)} ({diagnostics.linesMapped.toLocaleString()})
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Shipments w/ tracking</dt>
            <dd className="font-medium tabular-nums">
              {fmtPct(trackingPct)} ({diagnostics.shipmentsTotal.toLocaleString()} total)
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Parser versions</dt>
            <dd className="font-medium">
              {diagnostics.parseVersions.length ? diagnostics.parseVersions.join(', ') : 'legacy'}
            </dd>
          </div>
        </dl>
        {warnings.length ? (
          <ul className="mt-4 list-disc space-y-1 border-t border-border pt-3 pl-5 text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Coverage looks adequate for this dataset.
          </p>
        )}
      </div>
    </section>
  )
}
