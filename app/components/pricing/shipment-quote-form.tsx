'use client'

import { useEffect, useRef, useState } from 'react'

import {
  CalculatorHero,
  CarrierSelector,
  ChipButton,
  ComparisonStrip,
  ResultsPlaceholder,
  RouteLane,
  SectionPanel,
} from '@/app/components/pricing/calculator-ui'
import { CalculatorAccuracyPanel } from '@/app/components/pricing/calculator-accuracy-panel'
import { CarrierLogo } from '@/app/components/pricing/carrier-logo'
import { RateResult } from '@/app/components/pricing/rate-result'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  FEDEX_SERVICE_LABELS,
  UPS_SERVICE_LABELS,
  type FedExRateBreakdown,
  type FedExService,
  type PricingCarrier,
  type UPSRateBreakdown,
  type UPSRateType,
  type UPSService,
} from '@/lib/pricing'
import { cn } from '@/lib/utils'

const UPS_SERVICES: UPSService[] = ['ground', '3day', '2day', '2day_am', 'nda_saver', 'nda']
const FEDEX_SERVICES: FedExService[] = [
  'ground',
  'home_delivery',
  'express_saver',
  '2day',
  'standard_overnight',
  'priority_overnight',
]

type Props = {
  defaultOriginZip?: string
}

type EstimateBreakdown = UPSRateBreakdown | FedExRateBreakdown

export function ShipmentQuoteForm({ defaultOriginZip = '' }: Props) {
  const [showUps, setShowUps] = useState(true)
  const [showFedEx, setShowFedEx] = useState(true)
  const [weightLbs, setWeightLbs] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [originZip, setOriginZip] = useState(defaultOriginZip)
  const [destinationZip, setDestinationZip] = useState('')
  const [upsService, setUpsService] = useState<UPSService>('ground')
  const [fedexService, setFedexService] = useState<FedExService>('ground')
  const [rateType, setRateType] = useState<UPSRateType>('daily')
  const [residential, setResidential] = useState(false)
  const [nonStandardPackaging, setNonStandardPackaging] = useState(false)
  const [addressCorrection, setAddressCorrection] = useState(false)
  const [declaredValue, setDeclaredValue] = useState('')
  const [markupPct, setMarkupPct] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upsResult, setUpsResult] = useState<UPSRateBreakdown | null>(null)
  const [fedexResult, setFedexResult] = useState<FedExRateBreakdown | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setOriginZip(defaultOriginZip)
  }, [defaultOriginZip])

  useEffect(() => {
    abortRef.current?.abort()
    setUpsResult(null)
    setFedexResult(null)
    setLoading(false)
  }, [
    showUps, showFedEx, weightLbs, length, width, height, originZip, destinationZip,
    upsService, fedexService, rateType, residential, nonStandardPackaging,
    addressCorrection, declaredValue,
  ])

  function toggleCarrier(carrier: PricingCarrier, enabled: boolean) {
    if (carrier === 'ups') {
      if (!enabled && !showFedEx) return
      setShowUps(enabled)
    } else {
      if (!enabled && !showUps) return
      setShowFedEx(enabled)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setError(null)
    setUpsResult(null)
    setFedexResult(null)

    if (!showUps && !showFedEx) {
      setError('Enable at least one carrier above.')
      return
    }

    const wt = parseFloat(weightLbs)
    if (!wt || wt <= 0) { setError('Enter a valid weight.'); return }
    if (!/^\d{5}$/.test(destinationZip)) { setError('Destination ZIP must be 5 digits.'); return }
    if (!/^\d{5}$/.test(originZip)) { setError('Origin ZIP must be 5 digits.'); return }

    const l = parseFloat(length)
    const w = parseFloat(width)
    const h = parseFloat(height)
    const hasDims = l > 0 && w > 0 && h > 0

    setLoading(true)
    try {
      const bodyBase = {
        weightLbs: wt,
        ...(hasDims ? { dimensionsIn: { length: l, width: w, height: h } } : {}),
        originZip,
        destinationZip,
        residential,
        nonStandardPackaging,
        addressCorrection,
        declaredValueDollars: (() => {
          const dv = declaredValue ? parseFloat(declaredValue) : 0
          return dv > 0 ? dv : 0
        })(),
      }

      async function fetchEstimate(carrier: PricingCarrier): Promise<EstimateBreakdown> {
        const res = await fetch('/api/pricing/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            ...bodyBase,
            carrier,
            service: carrier === 'ups' ? upsService : fedexService,
            ...(carrier === 'ups' ? { rateType } : {}),
          }),
        })
        const data = await res.json() as { breakdown?: EstimateBreakdown; error?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? 'Something went wrong.')
        if (!data.breakdown) throw new Error('No breakdown returned.')
        return data.breakdown
      }

      const tasks: Promise<void>[] = []
      if (showUps) {
        tasks.push(fetchEstimate('ups').then(b => { if (!ac.signal.aborted) setUpsResult(b as UPSRateBreakdown) }))
      }
      if (showFedEx) {
        tasks.push(fetchEstimate('fedex').then(b => { if (!ac.signal.aborted) setFedexResult(b as FedExRateBreakdown) }))
      }
      await Promise.all(tasks)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const declaredValueHint =
    showUps && showFedEx
      ? 'UPS: $1.70/$100, min $5.11 · FedEx: $4.95 min to $300, then $1.65/$100'
      : showFedEx
        ? '$4.95 minimum up to $300; $1.65 per $100 above'
        : '$1.70 per $100, minimum $5.11'

  const hasResults = (showUps && upsResult) || (showFedEx && fedexResult)
  const showComparison = showUps && showFedEx && upsResult && fedexResult
  const markup = markupPct ? parseFloat(markupPct) : undefined

  return (
    <div className="space-y-5">
      <CalculatorHero />
      <CalculatorAccuracyPanel />

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-5">
          <SectionPanel step="01" title="Carriers" description="Choose which carriers to estimate">
            <CarrierSelector
              showUps={showUps}
              showFedEx={showFedEx}
              onToggleUps={v => toggleCarrier('ups', v)}
              onToggleFedEx={v => toggleCarrier('fedex', v)}
            />
          </SectionPanel>

          <SectionPanel step="02" title="Lane & weight" description="Origin, destination, and billable inputs">
            <div className="space-y-4">
              <RouteLane
                originZip={originZip}
                destinationZip={destinationZip}
                onOriginChange={setOriginZip}
                onDestChange={setDestinationZip}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2 space-y-1.5 sm:col-span-1">
                  <Label htmlFor="weight" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Weight (lb)
                  </Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="5.0"
                    value={weightLbs}
                    onChange={e => setWeightLbs(e.target.value)}
                    className="font-mono"
                  />
                </div>
                {[
                  { id: 'length', label: 'L', value: length, set: setLength },
                  { id: 'width', label: 'W', value: width, set: setWidth },
                  { id: 'height', label: 'H', value: height, set: setHeight },
                ].map(({ id, label, value, set }) => (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={id} className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {label} (in)
                    </Label>
                    <Input
                      id={id}
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="—"
                      className="font-mono"
                      value={value}
                      onChange={e => set(e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dimensions optional — used for dimensional weight (DIM).
              </p>
            </div>
          </SectionPanel>

          <SectionPanel step="03" title="Delivery profile" description="Commercial vs residential destination">
            <div className="flex gap-2">
              {(['Commercial', 'Residential'] as const).map(type => {
                const isRes = type === 'Residential'
                return (
                  <ChipButton
                    key={type}
                    active={residential === isRes}
                    onClick={() => setResidential(isRes)}
                    className="flex-1 py-2 text-sm"
                  >
                    {type}
                  </ChipButton>
                )
              })}
            </div>
          </SectionPanel>

          {(showUps || showFedEx) && (
            <SectionPanel step="04" title="Carrier services" description="Independent service level per carrier">
              <div className="space-y-4">
                {showUps && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CarrierLogo carrier="ups" size="sm" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">UPS</span>
                      </div>
                      <div className="flex gap-1">
                        {([
                          { value: 'daily' as const, label: 'Daily' },
                          { value: 'smallBusiness' as const, label: 'Small Biz' },
                        ]).map(({ value, label }) => (
                          <ChipButton key={value} active={rateType === value} onClick={() => setRateType(value)}>
                            {label}
                          </ChipButton>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {UPS_SERVICES.map(svc => (
                        <ChipButton key={svc} active={upsService === svc} onClick={() => setUpsService(svc)}>
                          {UPS_SERVICE_LABELS[svc]}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                )}
                {showUps && showFedEx ? <Separator /> : null}
                {showFedEx && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CarrierLogo carrier="fedex" size="sm" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">FedEx</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {FEDEX_SERVICES.map(svc => (
                        <ChipButton key={svc} active={fedexService === svc} onClick={() => setFedexService(svc)}>
                          {FEDEX_SERVICE_LABELS[svc]}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionPanel>
          )}

          <SectionPanel step="05" title="Accessorials & pricing" description="Optional surcharges and client markup">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleRow
                  checked={nonStandardPackaging}
                  onChange={setNonStandardPackaging}
                  title="Non-standard packaging"
                  hint="Triggers additional handling"
                />
                <ToggleRow
                  checked={addressCorrection}
                  onChange={setAddressCorrection}
                  title="Address correction"
                  hint="Post-shipment invalid address"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                Advanced — declared value & markup
                <span className="font-mono text-[10px]">{showAdvanced ? '−' : '+'}</span>
              </button>

              {showAdvanced && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="declared-value" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Declared value
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input id="declared-value" type="number" min="0" step="1" placeholder="0" value={declaredValue} onChange={e => setDeclaredValue(e.target.value)} className="pl-6 font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="markup" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Client markup
                    </Label>
                    <div className="relative">
                      <Input id="markup" type="number" min="0" step="0.1" placeholder="15" value={markupPct} onChange={e => setMarkupPct(e.target.value)} className="pr-7 font-mono" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-muted-foreground">{declaredValueHint}</p>
                </div>
              )}
            </div>
          </SectionPanel>

          <p className="text-[11px] text-muted-foreground">
            Contract discounts from{' '}
            <a href="/protected" className="font-medium text-primary underline-offset-2 hover:underline">
              My Profile
            </a>{' '}
            are applied automatically.
          </p>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-mono text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading || (!showUps && !showFedEx)} className="h-11 w-full font-semibold tracking-wide">
            {loading ? 'Running rate engine…' : showUps && showFedEx ? 'Estimate UPS & FedEx' : showFedEx ? 'Estimate FedEx' : 'Estimate UPS'}
          </Button>
        </form>

        <div className="space-y-4 lg:col-span-7 lg:sticky lg:top-6">
          {showComparison ? (
            <ComparisonStrip
              upsTotal={upsResult!.totalEstimatedCharge}
              fedexTotal={fedexResult!.totalEstimatedCharge}
            />
          ) : null}

          {!hasResults && !loading ? <ResultsPlaceholder loading={false} /> : null}
          {loading && !hasResults ? <ResultsPlaceholder loading /> : null}

          <div className={cn('space-y-4', showUps && showFedEx && hasResults && 'xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0')}>
            {showUps && upsResult ? (
              <RateResult breakdown={upsResult} carrier="ups" markupPct={markup} />
            ) : null}
            {showFedEx && fedexResult ? (
              <RateResult breakdown={fedexResult} carrier="fedex" markupPct={markup} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition',
        checked ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/10 hover:bg-muted/20',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
        )}
      >
        {checked ? '✓' : ''}
      </span>
      <span>
        <span className="block text-sm font-medium leading-none">{title}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}
