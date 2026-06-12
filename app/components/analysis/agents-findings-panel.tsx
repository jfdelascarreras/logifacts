'use client'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  ActionItem,
  AnomalyFlag,
  CarrierMixRow,
  DatasetFlags,
  SavingsEstimate,
} from '@/lib/premium-analysis/agents-types'
import type { SpecCategoriesSummary } from '@/lib/premium-analysis/spec-categories'

function fmtUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

type Props = {
  summary: {
    specCategories?: SpecCategoriesSummary
    carrierMix?: CarrierMixRow[]
    anomalyFlags?: AnomalyFlag[]
    savingsEstimate?: SavingsEstimate
    actionItems?: ActionItem[]
    datasetFlags?: DatasetFlags
  } | null
}

export function AgentsFindingsPanel({ summary }: Props) {
  if (!summary?.specCategories && !summary?.anomalyFlags?.length) return null

  const spec = summary.specCategories
  const flags = summary.anomalyFlags ?? []
  const savings = summary.savingsEstimate
  const actions = summary.actionItems ?? []
  const dataset = summary.datasetFlags

  return (
    <div className="space-y-4">
      {dataset?.wwePresent && dataset.wweFuelEmbedded ? (
        <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          WWE/WWEX data present: fuel surcharge is embedded in base rates and cannot be verified as a separate line item.
        </p>
      ) : null}

      {spec ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost structure</CardTitle>
            <CardDescription>Spend by standardized category with share of total net spend.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spec.categories.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="font-medium">{c.category.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right">{fmtUSD(c.totalCost)}</TableCell>
                    <TableCell className="text-right">{fmtPct(c.pctOfTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {dataset?.accessorialRateHigh ? (
              <p className="mt-3 text-xs text-destructive">
                Accessorial rate {fmtPct(dataset.accessorialRate)} exceeds 10% benchmark (normal 5–8%).
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {summary.carrierMix?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carrier mix</CardTitle>
            <CardDescription>Shipments and average cost by service and zone mode.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Zone mode</TableHead>
                  <TableHead className="text-right">Shipments</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Avg / shipment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.carrierMix.slice(0, 15).map((r, i) => (
                  <TableRow key={`${r.carrier}-${r.service}-${r.zoneMode}-${i}`}>
                    <TableCell>{r.carrier}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={r.service}>
                      {r.service}
                    </TableCell>
                    <TableCell>{r.zoneMode}</TableCell>
                    <TableCell className="text-right">{r.shipmentCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{fmtUSD(r.totalCost)}</TableCell>
                    <TableCell className="text-right">{fmtUSD(r.avgCostPerShipment)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {savings ? (
        <Card className="overflow-hidden border-emerald-300/60 bg-gradient-to-br from-emerald-50/90 via-card to-card dark:from-emerald-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 dark:text-emerald-100">
              Annualized savings opportunity
            </CardTitle>
            <CardDescription>
              Based on {savings.annualizedBasisMonths} month(s) in your invoices — recoverable spend if you act on the
              findings below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                {fmtUSD(savings.low)} – {fmtUSD(savings.high)}
              </p>
              <span className="text-sm font-medium text-emerald-800/80 dark:text-emerald-200/80">per year</span>
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
              You could recover up to{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{fmtUSD(savings.high)}</span>{' '}
              annually by addressing the prioritized actions — starting with the top items marked below.
            </p>
            {actions[0] ? (
              <div className="rounded-lg border border-emerald-200/80 bg-white/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <span className="font-semibold">Quick win:</span> #{actions[0].rank} {actions[0].category} — up to{' '}
                {fmtUSD(actions[0].annualSavingsHigh)}/yr
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {actions.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prioritized actions</CardTitle>
            <CardDescription>Top items ranked by savings impact and effort.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {actions.slice(0, 8).map((a) => (
              <div
                key={a.rank}
                className={
                  a.executable
                    ? 'rounded-md border border-emerald-300/70 bg-emerald-50/60 p-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30'
                    : 'rounded-md border p-3'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">#{a.rank} {a.category}</span>
                  {a.executable ? (
                    <Badge className="border-emerald-400 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">
                      Start here
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">{a.effort} effort</Badge>
                  <span className="text-xs text-muted-foreground">
                    {fmtUSD(a.annualSavingsLow)} – {fmtUSD(a.annualSavingsHigh)} / yr
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.instructions}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {flags.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anomaly flags</CardTitle>
            <CardDescription>{flags.length} item(s) flagged against AGENTS universal checks.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.slice(0, 50).map((f, i) => (
                  <TableRow key={`${f.type}-${f.trackingNumber}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs">{f.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{f.trackingNumber ?? '—'}</TableCell>
                    <TableCell className="text-right">{fmtUSD(f.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
