'use client'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ingest status</CardTitle>
        <CardDescription>Read path, parser freshness, and run-over-run stability.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {ingestSource ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Read path</span>
            <Badge variant="secondary">{ingestSource}</Badge>
          </div>
        ) : null}

        {staleIngest?.needsReupload ? (
          <ul className="list-disc space-y-1 pl-4 text-amber-900 dark:text-amber-100">
            {staleIngest.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}

        {ingestSource === 'legacy' ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Legacy read path — analysis uses deprecated adapters. Re-upload invoices or confirm
            invoice_rows is populated, then remove PREMIUM_INGEST_SOURCE=legacy.
          </p>
        ) : null}

        {runRegression?.significantChange && runRegression.message ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {runRegression.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
