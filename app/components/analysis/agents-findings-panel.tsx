'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { paper, paperTableCell, paperTableHeadCell } from '@/app/components/analysis/premium-paper-styles'
import { cn } from '@/lib/utils'
import type {
  ActionItem,
  AnomalyFlag,
  CarrierMixRow,
  DatasetFlags,
  IngestQualityGate,
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
    ingestQuality?: IngestQualityGate
  } | null
}

export function AgentsFindingsPanel({ summary }: Props) {
  if (!summary?.specCategories && !summary?.anomalyFlags?.length) return null

  const spec = summary.specCategories
  const flags = summary.anomalyFlags ?? []
  const savings = summary.savingsEstimate
  const actions = summary.actionItems ?? []
  const dataset = summary.datasetFlags
  const ingestQuality = summary.ingestQuality

  return (
    <div className="space-y-4">
      {dataset?.wwePresent && dataset.wweFuelEmbedded ? (
        <p className={cn(paper.alert, 'text-xs')}>
          Note: WWE/WWEX fuel surcharge is embedded in base rates and is not verified as a separate line item.
        </p>
      ) : null}

      {spec ? (
        <section className={paper.section}>
          <header className={paper.sectionHeader}>
            <h2 className={paper.sectionTitle}>
              <span className={paper.sectionNumber}>Table 5.</span>
              Cost structure
            </h2>
            <p className={paper.sectionDesc}>Standardized categories as a share of total net spend.</p>
          </header>
          <div className={paper.sectionBody}>
            <div className={paper.tableWrap}>
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
                Accessorial rate {fmtPct(dataset.accessorialRate)} exceeds the 10% benchmark (typical range 5–8%).
              </p>
            ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {summary.carrierMix?.length ? (
        <section className={paper.section}>
          <header className={paper.sectionHeader}>
            <h2 className={paper.sectionTitle}>
              <span className={paper.sectionNumber}>Table 6.</span>
              Carrier mix
            </h2>
            <p className={paper.sectionDesc}>Shipments and average cost by service and zone mode.</p>
          </header>
          <div className={cn(paper.sectionBody, paper.tableWrap, 'overflow-x-auto')}>
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
          </div>
        </section>
      ) : null}

      {ingestQuality?.blockSavings ? (
        <p className={cn(paper.alert, 'text-xs')}>
          Savings estimates suppressed: {ingestQuality.reason}
        </p>
      ) : null}

      {savings ? (
        <section className={paper.section}>
          <header className={paper.sectionHeader}>
            <h2 className={paper.sectionTitle}>
              <span className={paper.sectionNumber}>§2</span>
              Annualized savings estimate
            </h2>
            <p className={paper.sectionDesc}>
              Point estimate based on {savings.annualizedBasisMonths} month(s) in the invoice sample.
            </p>
          </header>
          <div className={paper.sectionBody}>
            <p className="text-2xl font-medium tabular-nums text-foreground">
              {fmtUSD(savings.low)} – {fmtUSD(savings.high)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">per year</span>
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              Upper bound recoverable spend if prioritized actions below are implemented.
            </p>
            {actions[0] ? (
              <p className={cn(paper.alert, 'mt-3 text-xs')}>
                Leading action: #{actions[0].rank} {actions[0].category} — up to{' '}
                {fmtUSD(actions[0].annualSavingsHigh)}/yr.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {actions.length && !ingestQuality?.blockSavings ? (
        <section className={paper.section}>
          <header className={paper.sectionHeader}>
            <h2 className={paper.sectionTitle}>
              <span className={paper.sectionNumber}>Table 7.</span>
              Prioritized actions
            </h2>
            <p className={paper.sectionDesc}>Ranked by estimated savings and implementation effort.</p>
          </header>
          <div className={paper.sectionBody}>
            <div className={paper.tableWrap}>
            <table className={paper.table}>
              <thead className={paper.tableHead}>
                <tr>
                  <th className={paperTableHeadCell()}>Rank</th>
                  <th className={paperTableHeadCell()}>Category</th>
                  <th className={paperTableHeadCell()}>Effort</th>
                  <th className={paperTableHeadCell(true)}>Annual savings</th>
                </tr>
              </thead>
              <tbody>
                {actions.slice(0, 8).map((a) => (
                  <tr key={a.rank}>
                    <td className={paperTableCell()}>#{a.rank}</td>
                    <td className={paperTableCell(false, true)}>
                      {a.category}
                      {a.executable ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">(recommended first)</span>
                      ) : null}
                      <p className="mt-1 text-xs font-normal text-muted-foreground">{a.instructions}</p>
                    </td>
                    <td className={paperTableCell()}>{a.effort}</td>
                    <td className={paperTableCell(true)}>
                      {fmtUSD(a.annualSavingsLow)} – {fmtUSD(a.annualSavingsHigh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      ) : null}

      {flags.length ? (
        <section className={paper.section}>
          <header className={paper.sectionHeader}>
            <h2 className={paper.sectionTitle}>
              <span className={paper.sectionNumber}>Table 8.</span>
              Anomaly flags
            </h2>
            <p className={paper.sectionDesc}>{flags.length} observation(s) from universal AGENTS checks.</p>
          </header>
          <div className={cn(paper.sectionBody, paper.tableWrap, 'overflow-x-auto')}>
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
          </div>
        </section>
      ) : null}
    </div>
  )
}
