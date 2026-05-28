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
    rateType,
    service,
    billableWeightLbs,
    billableWeightSource,
    dimWeightLbs,
    zone,
    publishedRate,
    contractDiscounts,
    netTransportationCharge,
    fuelSurchargeRate,
    fuelSurcharge,
    residentialSurcharge,
    dasSurchargeType,
    dasSurcharge,
    largePackageSurcharge,
    additionalHandlingTrigger,
    additionalHandlingSurcharge,
    remoteAreaType,
    remoteAreaSurcharge,
    declaredValueCharge,
    addressCorrectionCharge,
    totalEstimatedCharge,
  } = b

  const isSB = rateType === 'smallBusiness'
  const transportationDiscount = contractDiscounts.transportation

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-start justify-between p-5 bg-muted/30">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Estimated Total
              </p>
              {isSB && (
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
                  Small Business
                </span>
              )}
            </div>
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
        <div className="grid grid-cols-2 gap-px bg-border">
          {[
            {
              label: 'Contract Discount',
              value: isSB ? 'N/A' : (transportationDiscount > 0 ? pct(transportationDiscount) : 'None'),
            },
            {
              label: 'Fuel Surcharge',
              value: isSB ? 'Waived' : pct(fuelSurchargeRate),
            },
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
            ...(transportationDiscount > 0 ? [{
              label: `Contract Discount (${pct(transportationDiscount)})`,
              value: `−${fmt(publishedRate * transportationDiscount)}`,
              className: 'text-red-400',
            }] : []),
          ].map(({ label, value, className }) => (
            <div key={label} className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn('font-mono font-medium', className ?? '')}>{value}</span>
            </div>
          ))}

          <div className="flex justify-between py-1.5 border-b border-border text-sm font-medium">
            <span>Net Transportation Charge</span>
            <span className="font-mono text-green-500">{fmt(netTransportationCharge)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border text-sm">
            <span className="text-muted-foreground">Fuel Surcharge ({pct(fuelSurchargeRate)})</span>
            <span className="font-mono text-amber-500">+{fmt(fuelSurcharge)}</span>
          </div>
          {residentialSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">Residential Surcharge</span>
              <span className="font-mono text-amber-500">+{fmt(residentialSurcharge)}</span>
            </div>
          )}
          {dasSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">
                Delivery Area Surcharge{dasSurchargeType === 'extended' ? ' — Extended' : ''}
              </span>
              <span className="font-mono text-amber-500">+{fmt(dasSurcharge)}</span>
            </div>
          )}
          {largePackageSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">Large Package Surcharge</span>
              <span className="font-mono text-amber-500">+{fmt(largePackageSurcharge)}</span>
            </div>
          )}
          {additionalHandlingSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">
                Additional Handling
                {additionalHandlingTrigger ? ` (${additionalHandlingTrigger})` : ''}
              </span>
              <span className="font-mono text-amber-500">+{fmt(additionalHandlingSurcharge)}</span>
            </div>
          )}
          {remoteAreaSurcharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">
                Remote Area Surcharge ({remoteAreaType === 'alaska' ? 'Alaska' : 'Hawaii'})
              </span>
              <span className="font-mono text-amber-500">+{fmt(remoteAreaSurcharge)}</span>
            </div>
          )}
          {declaredValueCharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">Declared Value</span>
              <span className="font-mono text-amber-500">+{fmt(declaredValueCharge)}</span>
            </div>
          )}
          {addressCorrectionCharge > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-sm">
              <span className="text-muted-foreground">Address Correction</span>
              <span className="font-mono text-amber-500">+{fmt(addressCorrectionCharge)}</span>
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

      <p className="text-xs text-muted-foreground text-center">
        {isSB
          ? 'Rates are 2026 UPS Small Business Rates (eff. Jan 26, 2026). No fuel surcharge, DAS, AH, LPS, or address correction in SB program.'
          : 'Published list rates are 2026 UPS Daily Rates. Fuel surcharge varies weekly. All figures are estimates.'
        }
      </p>
    </div>
  )
}
