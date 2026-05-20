'use client'

import { ACCESSORIAL_REFERENCE, UPS_SERVICE_LABELS } from '@/lib/pricing'
import type { UPSRateBreakdown } from '@/lib/pricing'
import { cn } from '@/lib/utils'

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

type Props = { breakdown: UPSRateBreakdown }

export function RateResult({ breakdown: b }: Props) {
  const {
    service,
    billableWeightLbs,
    billableWeightSource,
    dimWeightLbs,
    zone,
    publishedRate,
    serviceIncentivePct,
    tierIncentivePct,
    pldBonusPct,
    totalDiscountPct,
    netTransportationCharge,
    fuelSurcharge,
    residentialSurcharge,
    totalEstimatedCharge,
    estimatedContractTerms,
  } = b

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-start justify-between p-5 bg-muted/30">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
              Estimated Total
            </p>
            <p className="text-4xl font-bold tabular-nums text-green-500">
              {fmt(totalEstimatedCharge)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {UPS_SERVICE_LABELS[service]} · Zone {zone} · {billableWeightLbs} lb billable
              {b.residentialSurcharge > 0 ? ' · Residential' : ' · Commercial'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Billable Wt
            </p>
            <p className="text-2xl font-bold tabular-nums text-amber-500 mt-1">
              {billableWeightLbs} lb
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {billableWeightSource === 'dimensional'
                ? `DIM governs (actual ${b.actualWeightLbs} lb)`
                : dimWeightLbs
                  ? `Actual governs (DIM ${dimWeightLbs} lb)`
                  : 'Actual governs'}
            </p>
          </div>
        </div>

        {/* Discount chips */}
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            { label: 'Service Disc', value: pct(serviceIncentivePct) },
            { label: 'Tier Disc', value: pct(tierIncentivePct) },
            { label: 'Total Off List', value: pct(totalDiscountPct) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Breakdown */}
        <div className="p-4 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Cost Breakdown
          </p>
          {[
            { label: 'Published List Rate', value: fmt(publishedRate), className: '' },
            { label: `Service Incentive (${pct(serviceIncentivePct)})`, value: `−${fmt(publishedRate * serviceIncentivePct)}`, className: 'text-red-400' },
            { label: `Tier Incentive (${pct(tierIncentivePct)})`, value: `−${fmt(publishedRate * tierIncentivePct)}`, className: 'text-red-400' },
            { label: `PLD Bonus (${pct(pldBonusPct)})`, value: `−${fmt(publishedRate * pldBonusPct)}`, className: 'text-red-400' },
          ].map(({ label, value, className }) => (
            <div key={label} className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn('font-mono font-medium', className)}>{value}</span>
            </div>
          ))}

          <div className="flex justify-between py-1.5 border-b border-border text-sm font-medium">
            <span>Net Transportation Charge</span>
            <span className="font-mono text-green-500">{fmt(netTransportationCharge)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border text-sm">
            <span className="text-muted-foreground">Fuel Surcharge (est. 17.2%)</span>
            <span className="font-mono text-amber-500">+{fmt(fuelSurcharge)}</span>
          </div>
          {residentialSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">Residential Surcharge</span>
              <span className="font-mono text-amber-500">+{fmt(residentialSurcharge)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 text-sm font-semibold border-t border-primary/30 mt-1">
            <span className="text-primary">Total Est. Invoice Charge</span>
            <span className="font-mono text-primary">{fmt(totalEstimatedCharge)}</span>
          </div>
        </div>
      </div>

      {/* Accessorial reference */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Contract Accessorial Rates (reference)
        </p>
        <div className="space-y-1">
          {ACCESSORIAL_REFERENCE.map(({ name, net, detail }) => (
            <div key={name} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
              <span className="text-muted-foreground">{name}</span>
              <span className="font-mono text-xs">
                {net}{detail ? ` · ${detail}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {estimatedContractTerms && (
        <p className="text-xs text-amber-500/80">
          NDA Saver contract discount terms are estimated — not specified in Contract D001207201 Addendum B.
        </p>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Rates based on UPS Contract D001207201 Addendum B. Published list rates are 2026 UPS Daily Rates.
        Fuel surcharge varies weekly. Quarterly rebate (3%) not included. All figures are estimates.
      </p>
    </div>
  )
}
