'use client'

import { useState } from 'react'

import { CarrierLogo } from '@/app/components/pricing/carrier-logo'
import {
  ACCESSORIAL_REFERENCE,
  FEDEX_ACCESSORIAL_REFERENCE,
  FEDEX_SERVICE_LABELS,
  UPS_SERVICE_LABELS,
  type FedExRateBreakdown,
  type PricingCarrier,
  type RemoteAreaType,
  type UPSRateBreakdown,
} from '@/lib/pricing'
import { cn } from '@/lib/utils'

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function remoteAreaLabel(type: RemoteAreaType): string {
  if (type === 'alaska') return 'Alaska'
  if (type === 'hawaii') return 'Hawaii'
  return 'Remote US'
}

type Props = {
  breakdown: UPSRateBreakdown | FedExRateBreakdown
  carrier: PricingCarrier
  markupPct?: number
}

function isFedExBreakdown(
  b: UPSRateBreakdown | FedExRateBreakdown,
): b is FedExRateBreakdown {
  return 'carrier' in b && b.carrier === 'fedex'
}

const CARRIER_ACCENT = {
  ups: 'border-l-4 border-l-[#C9941A]',
  fedex: 'border-l-4 border-l-[#4D148C]',
} as const

export function RateResult({ breakdown: b, carrier, markupPct }: Props) {
  const [showAccessorials, setShowAccessorials] = useState(false)
  const isFedEx = isFedExBreakdown(b)
  const isSB = !isFedEx && b.rateType === 'smallBusiness'
  const serviceLabel = isFedEx
    ? FEDEX_SERVICE_LABELS[b.service]
    : UPS_SERVICE_LABELS[b.service]

  const transportationDiscount = b.contractDiscounts.transportation
  const totalEstimatedCharge = b.totalEstimatedCharge

  const surchargeRows: { label: string; value: number }[] = []

  if (isFedEx) {
    if (b.homeDeliverySurcharge > 0) surchargeRows.push({ label: 'Home Delivery Residential', value: b.homeDeliverySurcharge })
    if (b.residentialSurcharge > 0) surchargeRows.push({ label: 'Residential', value: b.residentialSurcharge })
    if (b.dasSurcharge > 0) {
      surchargeRows.push({
        label: `DAS${b.dasSurchargeType === 'extended' ? ' Extended' : b.dasSurchargeType === 'remote' ? ' Remote' : ''}`,
        value: b.dasSurcharge,
      })
    }
    if (b.oversizeSurcharge > 0) surchargeRows.push({ label: 'Oversize', value: b.oversizeSurcharge })
    if (b.additionalHandlingSurcharge > 0) {
      surchargeRows.push({
        label: `Add. Handling${b.additionalHandlingTrigger ? ` (${b.additionalHandlingTrigger})` : ''}`,
        value: b.additionalHandlingSurcharge,
      })
    }
  } else {
    if (b.residentialSurcharge > 0) surchargeRows.push({ label: 'Residential', value: b.residentialSurcharge })
    if (b.dasSurcharge > 0) {
      surchargeRows.push({
        label: `DAS${b.dasSurchargeType === 'extended' ? ' Extended' : ''}`,
        value: b.dasSurcharge,
      })
    }
    if (b.largePackageSurcharge > 0) surchargeRows.push({ label: 'Large Package', value: b.largePackageSurcharge })
    if (b.additionalHandlingSurcharge > 0) {
      surchargeRows.push({
        label: `Add. Handling${b.additionalHandlingTrigger ? ` (${b.additionalHandlingTrigger})` : ''}`,
        value: b.additionalHandlingSurcharge,
      })
    }
    if (b.remoteAreaSurcharge > 0 && b.remoteAreaType) {
      surchargeRows.push({
        label: `Remote (${remoteAreaLabel(b.remoteAreaType)})`,
        value: b.remoteAreaSurcharge,
      })
    }
  }

  if (b.declaredValueCharge > 0) surchargeRows.push({ label: 'Declared Value', value: b.declaredValueCharge })
  if (b.addressCorrectionCharge > 0) surchargeRows.push({ label: 'Address Correction', value: b.addressCorrectionCharge })

  const accessorialRef = isFedEx ? FEDEX_ACCESSORIAL_REFERENCE : ACCESSORIAL_REFERENCE

  const lineItems: { label: string; value: string; tone?: 'base' | 'discount' | 'charge' | 'total' }[] = [
    { label: 'Published list rate', value: fmt(b.publishedRate) },
  ]
  if (transportationDiscount > 0) {
    lineItems.push({
      label: `Contract discount (${pct(transportationDiscount)})`,
      value: `−${fmt(b.publishedRate * transportationDiscount)}`,
      tone: 'discount',
    })
  }
  lineItems.push({ label: 'Net transportation', value: fmt(b.netTransportationCharge), tone: 'charge' })
  if (!isSB) {
    lineItems.push({
      label: `Fuel surcharge (${pct(b.fuelSurchargeRate)})`,
      value: `+${fmt(b.fuelSurcharge)}`,
      tone: 'charge',
    })
  }
  for (const row of surchargeRows) {
    lineItems.push({ label: row.label, value: `+${fmt(row.value)}`, tone: 'charge' })
  }
  lineItems.push({ label: 'Total estimate', value: fmt(totalEstimatedCharge), tone: 'total' })

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/80 bg-card', CARRIER_ACCENT[carrier])}>
      {/* Header */}
      <div className="border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CarrierLogo carrier={carrier} size="md" />
              {isSB && (
                <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                  Small Business
                </span>
              )}
            </div>
            <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-emerald-500 sm:text-4xl">
              {fmt(totalEstimatedCharge)}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {serviceLabel} · Zone <span className="font-mono">{b.zone}</span> ·{' '}
              <span className="font-mono">{b.billableWeightLbs}</span> lb billable ·{' '}
              {(isFedEx ? b.homeDeliverySurcharge + b.residentialSurcharge : b.residentialSurcharge) > 0
                ? 'Residential'
                : 'Commercial'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Billable wt</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-amber-500">{b.billableWeightLbs}</p>
            <p className="mt-0.5 max-w-[140px] text-[10px] leading-snug text-muted-foreground">
              {b.billableWeightSource === 'dimensional'
                ? `DIM (${b.actualWeightLbs} lb actual)`
                : b.dimWeightLbs
                  ? `Actual (${b.dimWeightLbs} lb DIM)`
                  : 'Actual weight'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatPill
            label="Contract disc."
            value={isSB ? 'N/A' : transportationDiscount > 0 ? pct(transportationDiscount) : 'None'}
          />
          <StatPill label="Fuel index" value={isSB ? 'Waived' : pct(b.fuelSurchargeRate)} />
        </div>
      </div>

      {/* Line items */}
      <div className="px-4 py-3 sm:px-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Charge composition
        </p>
        <div className="divide-y divide-border/50 rounded-lg border border-border/50 bg-background/40">
          {lineItems.map(({ label, value, tone }) => (
            <div
              key={label}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2 text-sm',
                tone === 'total' && 'bg-primary/5 font-semibold',
              )}
            >
              <span className={tone === 'total' ? 'text-primary' : 'text-muted-foreground'}>{label}</span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  tone === 'discount' && 'text-red-400',
                  tone === 'charge' && 'text-amber-500',
                  tone === 'total' && 'text-primary text-base',
                  !tone && 'text-foreground',
                )}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {markupPct != null && markupPct > 0 && (() => {
        const markupAmount = totalEstimatedCharge * (markupPct / 100)
        const customerPrice = totalEstimatedCharge + markupAmount
        return (
          <div className="border-t border-border/60 bg-primary/5 px-4 py-3 sm:px-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Client price · {markupPct}% markup
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your cost</span>
              <span className="font-mono tabular-nums">{fmt(totalEstimatedCharge)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Markup</span>
              <span className="font-mono tabular-nums text-amber-500">+{fmt(markupAmount)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-primary/20 pt-2">
              <span className="font-semibold text-primary">Bill to client</span>
              <span className="font-mono text-lg font-bold tabular-nums text-primary">{fmt(customerPrice)}</span>
            </div>
          </div>
        )
      })()}

      <div className="border-t border-border/60">
        <button
          type="button"
          onClick={() => setShowAccessorials(v => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition hover:bg-muted/20 hover:text-foreground sm:px-5"
        >
          <span className="flex items-center gap-2">
            <CarrierLogo carrier={carrier} size="sm" />
            List-rate reference
          </span>
          <span className="font-mono">{showAccessorials ? '−' : '+'}</span>
        </button>
        {showAccessorials && (
          <div className="border-t border-border/50 px-4 pb-3 sm:px-5">
            <div className="mt-2 space-y-0 divide-y divide-border/40">
              {accessorialRef.map(({ name, net, detail }) => (
                <div key={name} className="flex justify-between gap-2 py-2 text-xs">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-foreground">
                    {net}{detail ? ` · ${detail}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="border-t border-border/40 px-4 py-2 text-center text-[10px] leading-relaxed text-muted-foreground sm:px-5">
        {isSB
          ? '2026 UPS Small Business list rates · fuel/DAS/AH waived · estimate only'
          : isFedEx
            ? '2026 FedEx published list rates · weekly fuel index · estimate only — see Methodology panel'
            : '2026 UPS published list rates · weekly fuel index · estimate only — see Methodology panel'}
      </p>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
