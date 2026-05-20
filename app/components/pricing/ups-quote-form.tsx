'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UPS_SERVICE_LABELS } from '@/lib/pricing'
import type { UPSRateBreakdown, UPSService } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { RateResult } from './rate-result'

const SERVICES: UPSService[] = ['ground', '3day', '2day', 'nda_saver', 'nda']

type Props = { defaultOriginZip?: string }

export function UPSQuoteForm({ defaultOriginZip = '' }: Props) {
  const [weightLbs, setWeightLbs] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [originZip, setOriginZip] = useState(defaultOriginZip)
  const [destinationZip, setDestinationZip] = useState('')
  const [service, setService] = useState<UPSService>('ground')
  const [residential, setResidential] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UPSRateBreakdown | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

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
      const res = await fetch('/api/pricing/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightLbs: wt,
          ...(hasDims ? { dimensionsIn: { length: l, width: w, height: h } } : {}),
          originZip,
          destinationZip,
          service,
          residential,
        }),
      })
      const data = await res.json() as { breakdown?: UPSRateBreakdown; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong.')
      } else if (data.breakdown) {
        setResult(data.breakdown)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Package Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Weight + origin/dest */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Actual Weight (lbs)</Label>
                <Input
                  id="weight"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="e.g. 5"
                  value={weightLbs}
                  onChange={e => setWeightLbs(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin-zip">Origin ZIP</Label>
                <Input
                  id="origin-zip"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="60169"
                  value={originZip}
                  onChange={e => setOriginZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-zip">Destination ZIP</Label>
                <Input
                  id="dest-zip"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="10001"
                  value={destinationZip}
                  onChange={e => setDestinationZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="space-y-1.5">
              <Label>Dimensions — inches (optional, for DIM weight)</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'length', label: 'L', value: length, set: setLength },
                  { id: 'width', label: 'W', value: width, set: setWidth },
                  { id: 'height', label: 'H', value: height, set: setHeight },
                ].map(({ id, label, value, set }) => (
                  <div key={id} className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {label}
                    </span>
                    <Input
                      id={id}
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      className="pl-7"
                      value={value}
                      onChange={e => set(e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Service selector */}
            <div className="space-y-1.5">
              <Label>Service</Label>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map(svc => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => setService(svc)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      service === svc
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {UPS_SERVICE_LABELS[svc]}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery type */}
            <div className="space-y-1.5">
              <Label>Delivery Type</Label>
              <div className="flex gap-2">
                {(['Commercial', 'Residential'] as const).map(type => {
                  const isRes = type === 'Residential'
                  const active = residential === isRes
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setResidential(isRes)}
                      className={cn(
                        'rounded-md border px-4 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive font-mono">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Calculating…' : 'Calculate Net Cost →'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && <RateResult breakdown={result} />}
    </div>
  )
}
