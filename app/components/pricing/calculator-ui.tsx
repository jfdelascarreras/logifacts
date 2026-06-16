'use client'

import { CarrierLogo } from '@/app/components/pricing/carrier-logo'
import { cn } from '@/lib/utils'

export function CalculatorHero() {
  return (
    <div className="rounded-xl bg-gradient-midnight px-5 py-5 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-[#E8453C]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A8C4E0]">
          Rate Engine
        </span>
      </div>
      <h2 className="font-heading text-xl font-bold text-white sm:text-2xl">
        Shipment Cost Estimator
      </h2>
      <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#A8C4E0]">
        Multi-carrier list-rate modeling with contract discounts, fuel index, and accessorial logic.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00B4C5] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00B4C5]" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#00B4C5]">
          2026 Published Rates
        </span>
      </div>
    </div>
  )
}

export function CarrierSelector({
  showUps,
  showFedEx,
  onToggleUps,
  onToggleFedEx,
}: {
  showUps: boolean
  showFedEx: boolean
  onToggleUps: (v: boolean) => void
  onToggleFedEx: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Include in quote
      </span>
      <div className="flex flex-wrap gap-2">
        <CarrierToggle
          carrier="ups"
          label="UPS"
          active={showUps}
          disabled={showUps && !showFedEx}
          onClick={() => onToggleUps(!showUps)}
        />
        <CarrierToggle
          carrier="fedex"
          label="FedEx"
          active={showFedEx}
          disabled={showFedEx && !showUps}
          onClick={() => onToggleFedEx(!showFedEx)}
        />
      </div>
    </div>
  )
}

function CarrierToggle({
  carrier,
  label,
  active,
  disabled,
  onClick,
}: {
  carrier: 'ups' | 'fedex'
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-w-[7.5rem] items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all',
        active
          ? carrier === 'ups'
            ? 'border-[#C9941A]/50 bg-[#C9941A]/10 ring-1 ring-[#C9941A]/20'
            : 'border-[#4D148C]/50 bg-[#4D148C]/10 ring-1 ring-[#4D148C]/20'
          : 'border-border/70 bg-muted/20 hover:border-border hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <CarrierLogo carrier={carrier} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('text-xs font-semibold', active ? 'text-foreground' : 'text-muted-foreground')}>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{active ? 'Included' : 'Excluded'}</span>
      </span>
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
          active
            ? carrier === 'ups'
              ? 'border-[#C9941A] bg-[#C9941A] text-white'
              : 'border-[#4D148C] bg-[#4D148C] text-white'
            : 'border-border bg-background text-transparent',
        )}
      >
        ✓
      </span>
    </button>
  )
}

export function SectionPanel({
  title,
  description,
  step,
  children,
  className,
}: {
  title: string
  description?: string
  step?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/80 bg-card/50 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        {step ? (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-semibold text-muted-foreground">
            {step}
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function ChipButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all',
        active
          ? 'border-primary/60 bg-primary/10 text-primary shadow-sm'
          : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function RouteLane({
  originZip,
  destinationZip,
  onOriginChange,
  onDestChange,
}: {
  originZip: string
  destinationZip: string
  onOriginChange: (v: string) => void
  onDestChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
      <div className="space-y-1.5">
        <label htmlFor="origin-zip" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Origin
        </label>
        <input
          id="origin-zip"
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="60169"
          value={originZip}
          onChange={e => onOriginChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
          className="h-10 w-full rounded-lg border border-border bg-background/80 px-3 font-mono text-sm tracking-widest outline-none ring-offset-background transition focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>
      <div className="flex h-10 flex-col items-center justify-center pb-0.5 text-muted-foreground">
        <span className="text-[10px] font-medium uppercase tracking-widest">Lane</span>
        <span className="font-mono text-lg leading-none text-primary">→</span>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="dest-zip" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Destination
        </label>
        <input
          id="dest-zip"
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="10001"
          value={destinationZip}
          onChange={e => onDestChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
          className="h-10 w-full rounded-lg border border-border bg-background/80 px-3 font-mono text-sm tracking-widest outline-none ring-offset-background transition focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
        />
      </div>
    </div>
  )
}

export function ResultsPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/30">
        <span className="font-mono text-lg text-muted-foreground">Σ</span>
      </div>
      <p className="text-sm font-medium text-foreground">
        {loading ? 'Running rate engine…' : 'Awaiting calculation'}
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {loading
          ? 'Pulling published rates, zones, fuel, and accessorials.'
          : 'Configure shipment inputs and run the estimator to see carrier breakdowns here.'}
      </p>
    </div>
  )
}

export function ComparisonStrip({
  upsTotal,
  fedexTotal,
}: {
  upsTotal: number
  fedexTotal: number
}) {
  const delta = upsTotal - fedexTotal
  const cheaper = delta > 0 ? 'fedex' : delta < 0 ? 'ups' : null
  const fmt = (n: number) => `$${n.toFixed(2)}`

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Side-by-side comparison
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#C9941A]/30 bg-[#C9941A]/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">UPS</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{fmt(upsTotal)}</p>
        </div>
        <div className="rounded-lg border border-[#4D148C]/30 bg-[#4D148C]/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">FedEx</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{fmt(fedexTotal)}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-card px-3 py-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {cheaper
              ? `${cheaper === 'ups' ? 'UPS' : 'FedEx'} −${fmt(Math.abs(delta))}`
              : 'Tied'}
          </p>
        </div>
      </div>
    </div>
  )
}
