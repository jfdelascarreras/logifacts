'use client'

import { useState } from 'react'

import {
  CALCULATION_STEPS,
  FEDEX_SOURCES,
  FUEL_RATES,
  KNOWN_LIMITATIONS,
  UPS_SOURCES,
  type CarrierSourceRow,
} from '@/lib/pricing/calculator-metadata'

export function CalculatorAccuracyPanel() {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-xl border border-border/80 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start justify-between gap-4 px-4 py-3.5 text-left sm:px-5"
        aria-expanded={open}
      >
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Methodology & accuracy
          </span>
          <p className="mt-1 text-sm text-foreground">
            Published 2026 list rates · weekly fuel · contract discounts from your profile
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Estimates only — not a carrier invoice.
          </p>
        </div>
        <span className="mt-1 shrink-0 font-mono text-sm text-muted-foreground">{open ? '−' : '+'}</span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-border/60 px-4 pb-5 pt-4 sm:px-5">
          <DisclaimerBlock />

          <div className="grid gap-4 lg:grid-cols-2">
            <CarrierSourcesBlock carrier="UPS" sources={UPS_SOURCES} fuel={FUEL_RATES.ups} />
            <CarrierSourcesBlock carrier="FedEx" sources={FEDEX_SOURCES} fuel={FUEL_RATES.fedex} />
          </div>

          <CalculationBlock />

          <LimitationsBlock />
        </div>
      ) : null}
    </section>
  )
}

function DisclaimerBlock() {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        <span className="font-semibold">What this is:</span> a model of carrier-published tariffs,
        zones, fuel index, and accessorial rules — with your contract discounts applied.
        <span className="font-semibold"> What it is not:</span> a live carrier quote or invoice.
        Actual charges can differ due to rating corrections, peak surcharges, account programs, or
        rules not included in this estimate.
      </p>
    </div>
  )
}

function CarrierSourcesBlock({
  carrier,
  sources,
  fuel,
}: {
  carrier: 'UPS' | 'FedEx'
  sources: CarrierSourceRow[]
  fuel: { effectiveDate: string; ground: number; express?: number; air?: number; source: string }
}) {
  const fuelLabel =
    carrier === 'UPS'
      ? `Ground ${(fuel.ground * 100).toFixed(1)}% · Air ${((fuel as typeof FUEL_RATES.ups).air * 100).toFixed(1)}%`
      : `Ground ${(fuel.ground * 100).toFixed(1)}% · Express ${((fuel as typeof FUEL_RATES.fedex).express * 100).toFixed(1)}%`

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{carrier} data sources</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Fuel ({fuel.effectiveDate}): {fuelLabel}
      </p>
      <ul className="mt-3 space-y-2">
        {sources.map(row => (
          <li key={row.publication} className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
            <p className="text-xs font-medium text-foreground">{row.publication}</p>
            <p className="text-[11px] text-muted-foreground">{row.builds}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">Effective {row.effectiveDate}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CalculationBlock() {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">How totals are calculated</h3>
      <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
        {CALCULATION_STEPS.shared.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C9941A]">UPS-specific</p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            {CALCULATION_STEPS.ups.map(step => (
              <li key={step}>· {step}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4D148C]">FedEx-specific</p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            {CALCULATION_STEPS.fedex.map(step => (
              <li key={step}>· {step}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function LimitationsBlock() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Known limitations</h3>
      <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        {KNOWN_LIMITATIONS.shared.map(item => (
          <li key={item}>· {item}</li>
        ))}
        {KNOWN_LIMITATIONS.ups.map(item => (
          <li key={item}>
            · <span className="text-[#C9941A]">UPS:</span> {item}
          </li>
        ))}
        {KNOWN_LIMITATIONS.fedex.map(item => (
          <li key={item}>
            · <span className="text-[#4D148C]">FedEx:</span> {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
