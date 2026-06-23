'use client'

import { useEffect, useState } from 'react'

import { RateResult } from '@/app/components/pricing/rate-result'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FedExService } from '@/lib/pricing/fedex-types'
import { FEDEX_SERVICE_LABELS } from '@/lib/pricing/fedex-types'
import type { UPSService } from '@/lib/pricing/types'
import { UPS_SERVICE_LABELS } from '@/lib/pricing/types'
import { cn } from '@/lib/utils'
import { calculateRates, type CalculateRatesResult } from '../actions'

const UPS_SERVICES = Object.entries(UPS_SERVICE_LABELS) as [UPSService, string][]
const FEDEX_SERVICES = Object.entries(FEDEX_SERVICE_LABELS) as [FedExService, string][]

type Dims = { length: string; width: string; height: string }
type Errors = Partial<Record<string, string>>

interface Props {
  defaultDimensions: { length: number; width: number; height: number } | null
}

function parseDims(dims: Dims): { length: number; width: number; height: number } | undefined {
  const l = parseFloat(dims.length)
  const w = parseFloat(dims.width)
  const h = parseFloat(dims.height)
  if (dims.length === '' && dims.width === '' && dims.height === '') return undefined
  if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) return undefined
  return { length: l, width: w, height: h }
}

export function CalculatorForm({ defaultDimensions }: Props) {
  const [originZip, setOriginZip] = useState('')
  const [destinationZip, setDestinationZip] = useState('')
  const [weight, setWeight] = useState('')
  const [residential, setResidential] = useState(false)
  const [upsService, setUpsService] = useState<UPSService>('ground')
  const [fedexService, setFedexService] = useState<FedExService>('ground')
  const [dims, setDims] = useState<Dims>({
    length: defaultDimensions ? String(defaultDimensions.length) : '',
    width: defaultDimensions ? String(defaultDimensions.width) : '',
    height: defaultDimensions ? String(defaultDimensions.height) : '',
  })
  const [markup, setMarkup] = useState('0')
  const [nonStandard, setNonStandard] = useState(false)
  const [addressCorrection, setAddressCorrection] = useState(false)
  const [sandbox, setSandbox] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<CalculateRatesResult | null>(null)

  // Hydrate sandbox toggle from localStorage after mount
  useEffect(() => {
    try {
      setSandbox(localStorage.getItem('portal:sandbox') === 'true')
    } catch {
      // localStorage unavailable in some environments
    }
  }, [])

  const toggleSandbox = (value: boolean) => {
    setSandbox(value)
    try {
      localStorage.setItem('portal:sandbox', String(value))
    } catch {
      // ignore
    }
  }

  const validate = (): boolean => {
    const errs: Errors = {}

    if (!/^\d{5}$/.test(originZip)) errs.originZip = 'Must be exactly 5 digits.'
    if (!/^\d{5}$/.test(destinationZip)) errs.destinationZip = 'Must be exactly 5 digits.'

    const wt = parseFloat(weight)
    if (!weight || isNaN(wt) || wt <= 0) errs.weight = 'Must be a positive number.'

    const { length: l, width: w, height: h } = dims
    const anyDim = l !== '' || w !== '' || h !== ''
    const allDim = l !== '' && w !== '' && h !== ''
    if (anyDim && !allDim) errs.dims = 'If entering dimensions, all three values are required.'
    if (anyDim && allDim) {
      const parsed = parseDims(dims)
      if (!parsed) errs.dims = 'All dimensions must be positive numbers.'
    }

    const mu = parseFloat(markup)
    if (markup !== '' && (isNaN(mu) || mu < 0 || mu > 500)) {
      errs.markup = 'Markup must be between 0 and 500.'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    setResults(null)

    try {
      const result = await calculateRates({
        originZip,
        destinationZip,
        weightLbs: parseFloat(weight),
        residential,
        upsService,
        fedexService,
        dimensionsIn: parseDims(dims),
        markupPct: parseFloat(markup) || 0,
        nonStandard,
        addressCorrection,
        sandbox,
      })
      setResults(result)
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'An unexpected error occurred.' })
    } finally {
      setIsLoading(false)
    }
  }

  const markupPct = parseFloat(markup) || 0

  return (
    <div className="space-y-6">
      {/* Sandbox toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Mode:</span>
        <div className="flex rounded-lg border border-border text-sm font-medium overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSandbox(false)}
            className={cn(
              'px-3 py-1.5 transition-colors',
              !sandbox
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Production
          </button>
          <button
            type="button"
            onClick={() => toggleSandbox(true)}
            className={cn(
              'px-3 py-1.5 transition-colors border-l border-border',
              sandbox
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Sandbox
          </button>
        </div>
      </div>

      {sandbox && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>Sandbox mode</strong> — results are calculated with live rate data but{' '}
          <strong>not logged</strong> to your request history.
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Row 1: ZIPs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="originZip">Origin ZIP</Label>
            <Input
              id="originZip"
              placeholder="60601"
              maxLength={5}
              value={originZip}
              onChange={(e) => setOriginZip(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!!errors.originZip}
            />
            {errors.originZip && <p className="text-xs text-destructive">{errors.originZip}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="destinationZip">Destination ZIP</Label>
            <Input
              id="destinationZip"
              placeholder="90210"
              maxLength={5}
              value={destinationZip}
              onChange={(e) => setDestinationZip(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!!errors.destinationZip}
            />
            {errors.destinationZip && (
              <p className="text-xs text-destructive">{errors.destinationZip}</p>
            )}
          </div>
        </div>

        {/* Row 2: Weight + Residential */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="weight">Weight (lbs)</Label>
            <Input
              id="weight"
              type="number"
              min={0.1}
              step={0.1}
              placeholder="12.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-invalid={!!errors.weight}
            />
            {errors.weight && <p className="text-xs text-destructive">{errors.weight}</p>}
          </div>
          <div className="flex items-end pb-0.5">
            <label className="flex cursor-pointer items-center gap-3">
              <div
                role="checkbox"
                aria-checked={residential}
                tabIndex={0}
                onClick={() => setResidential((v) => !v)}
                onKeyDown={(e) => e.key === ' ' && setResidential((v) => !v)}
                className={cn(
                  'relative h-5 w-9 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  residential
                    ? 'border-accent bg-accent'
                    : 'border-border bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform shadow-sm',
                    residential ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </div>
              <span className="text-sm font-medium">Residential delivery</span>
            </label>
          </div>
        </div>

        {/* Row 3: Services */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="upsService">UPS Service</Label>
            <select
              id="upsService"
              value={upsService}
              onChange={(e) => setUpsService(e.target.value as UPSService)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {UPS_SERVICES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fedexService">FedEx Service</Label>
            <select
              id="fedexService"
              value={fedexService}
              onChange={(e) => setFedexService(e.target.value as FedExService)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {FEDEX_SERVICES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 4: Dimensions (optional) */}
        <div className="grid gap-1.5">
          <Label>
            Dimensions (in){' '}
            <span className="ml-1 font-normal text-muted-foreground">optional</span>
          </Label>
          <div className="grid grid-cols-3 gap-3">
            {(['length', 'width', 'height'] as const).map((dim) => (
              <div key={dim} className="grid gap-1">
                <span className="text-xs capitalize text-muted-foreground">{dim}</span>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  placeholder="0"
                  value={dims[dim]}
                  onChange={(e) => setDims((d) => ({ ...d, [dim]: e.target.value }))}
                  aria-invalid={!!errors.dims}
                />
              </div>
            ))}
          </div>
          {errors.dims && <p className="text-xs text-destructive">{errors.dims}</p>}
        </div>

        {/* Row 5: Markup + checkboxes */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="grid gap-1.5">
            <Label htmlFor="markup">
              Markup %{' '}
              <span className="ml-1 font-normal text-muted-foreground">optional</span>
            </Label>
            <Input
              id="markup"
              type="number"
              min={0}
              max={500}
              step={0.1}
              placeholder="0"
              className="w-28"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              aria-invalid={!!errors.markup}
            />
            {errors.markup && <p className="text-xs text-destructive">{errors.markup}</p>}
          </div>

          <div className="flex gap-5 pb-0.5">
            {(
              [
                { id: 'nonStandard', label: 'Non-standard pkg', value: nonStandard, set: setNonStandard },
                {
                  id: 'addressCorrection',
                  label: 'Address correction',
                  value: addressCorrection,
                  set: setAddressCorrection,
                },
              ] as const
            ).map(({ id, label, value, set }) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={id}
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}

        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? 'Calculating…' : 'Get Rates'}
        </Button>
      </form>

      {/* Results */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {['UPS', 'FedEx'].map((c) => (
            <div
              key={c}
              className="h-64 animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      )}

      {results && !isLoading && (
        <div className="space-y-4">
          {!results.hasContractDiscounts && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
              Rates reflect published carrier prices. Contact your account manager to configure
              contract discounts.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {results.ups.ok ? (
              <RateResult breakdown={results.ups.breakdown} carrier="ups" markupPct={markupPct} />
            ) : (
              <CarrierError carrier="UPS" message={results.ups.error} />
            )}

            {results.fedex.ok ? (
              <RateResult
                breakdown={results.fedex.breakdown}
                carrier="fedex"
                markupPct={markupPct}
              />
            ) : (
              <CarrierError carrier="FedEx" message={results.fedex.error} />
            )}
          </div>

          {results.requestId && !sandbox && (
            <p className="text-right text-xs text-muted-foreground">
              Request ID:{' '}
              <span className="font-mono">{results.requestId.slice(0, 8)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CarrierError({ carrier, message }: { carrier: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-foreground">{carrier}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
