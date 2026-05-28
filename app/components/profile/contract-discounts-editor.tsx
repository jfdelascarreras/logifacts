'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import type { ContractDiscounts } from '@/lib/pricing'

type DiscountField = keyof ContractDiscounts

const FIELDS: { key: DiscountField; label: string; placeholder: string }[] = [
  { key: 'transportation',    label: 'Transportation',        placeholder: 'e.g. 56' },
  { key: 'fuelSurcharge',     label: 'Fuel Surcharge',        placeholder: 'e.g. 30' },
  { key: 'residential',       label: 'Residential',           placeholder: 'e.g. 60' },
  { key: 'das',               label: 'Delivery Area (DAS)',   placeholder: 'e.g. 50' },
  { key: 'additionalHandling',label: 'Additional Handling',   placeholder: 'e.g. 50' },
  { key: 'largePackage',      label: 'Large Package',         placeholder: 'e.g. 50' },
  { key: 'addressCorrection', label: 'Address Correction',    placeholder: 'e.g. 50' },
  { key: 'declaredValue',     label: 'Declared Value',        placeholder: 'e.g. 40' },
]

function toPercent(decimal: number | undefined): string {
  if (!decimal) return ''
  const pct = decimal * 100
  return pct % 1 === 0 ? String(pct) : pct.toFixed(1)
}

function toDecimal(pct: string): number | undefined {
  const n = parseFloat(pct)
  if (isNaN(n) || n <= 0) return undefined
  return Math.min(n / 100, 0.95)
}

type Pcts = Record<DiscountField, string>

interface Props {
  initialDiscounts: ContractDiscounts
}

export function ContractDiscountsEditor({ initialDiscounts }: Props) {
  const [pcts, setPcts] = useState<Pcts>(() => {
    const init: Partial<Pcts> = {}
    for (const { key } of FIELDS) init[key] = toPercent(initialDiscounts[key])
    return init as Pcts
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    setMessage(null)

    const discounts: ContractDiscounts = {}
    for (const { key } of FIELDS) {
      const val = toDecimal(pcts[key])
      if (val !== undefined) discounts[key] = val
    }

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        data: { contract_discounts: discounts },
      })
      if (updateError) throw updateError
      setMessage('Contract discounts saved.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save discounts.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">UPS Contract Discounts</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Discount rates from your UPS agreement. These apply automatically in the Rate Calculator — leave a field blank if you have no discount for that category.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`discount-${key}`}>{label}</Label>
                <div className="relative">
                  <Input
                    id={`discount-${key}`}
                    type="number"
                    min="0"
                    max="95"
                    step="0.1"
                    placeholder={placeholder}
                    value={pcts[key]}
                    onChange={e => setPcts(p => ({ ...p, [key]: e.target.value }))}
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                </div>
              </div>
            ))}
          </div>

          {message && <p className="text-sm text-green-700">{message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save discounts'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
