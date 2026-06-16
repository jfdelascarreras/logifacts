'use client'

import { paper } from '@/app/components/analysis/premium-paper-styles'
import { cn } from '@/lib/utils'
import type { RunRegression } from '@/lib/premium-analysis/analysis-regression'
import type { StaleIngestAlert } from '@/lib/premium-analysis/stale-ingest'

type Props = {
  ingestSource?: 'invoice_rows' | 'legacy' | 'auto'
  staleIngest?: StaleIngestAlert
  runRegression?: RunRegression
}

export function IngestAlertsCard({ ingestSource, staleIngest, runRegression }: Props) {
  if (!ingestSource && !staleIngest?.needsReupload && !runRegression?.significantChange) {
    return null
  }

  return (
    <section className={paper.section}>
      <header className={paper.sectionHeader}>
        <h2 className={paper.sectionTitle}>
          <span className={paper.sectionNumber}>Note.</span>
          Ingest status
        </h2>
        <p className={paper.sectionDesc}>Read path, parser freshness, and run-over-run stability.</p>
      </header>
      <div className={cn(paper.sectionBody, 'space-y-3 text-sm')}>
        {ingestSource ? (
          <p>
            <span className="text-muted-foreground">Read path:</span>{' '}
            <span className="font-medium">{ingestSource}</span>
          </p>
        ) : null}

        {staleIngest?.needsReupload ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {staleIngest.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}

        {ingestSource === 'legacy' ? (
          <p className={cn(paper.alert, 'text-xs')}>
            Legacy read path — analysis uses deprecated adapters. Re-upload invoices or confirm invoice_rows is
            populated, then remove PREMIUM_INGEST_SOURCE=legacy.
          </p>
        ) : null}

        {runRegression?.significantChange && runRegression.message ? (
          <p className={cn(paper.alert, 'text-xs')}>{runRegression.message}</p>
        ) : null}
      </div>
    </section>
  )
}
