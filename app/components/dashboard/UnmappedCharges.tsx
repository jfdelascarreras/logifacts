'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { InvoiceLine, Carrier } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
  invoiceId: string
  carrier: Carrier
  onMappingSaved?: () => void
}

interface PendingMapping {
  charge_description: string
  transportation_mode: string
  category_1: string
  category_2: string
  category_3: string
  category_4: string
  category_5: string
  standardized_charge: string
}

export function UnmappedCharges({ lines, invoiceId, carrier, onMappingSaved }: Props) {
  const unmapped = lines.filter((l) => !l.mapped)
  const [saving, setSaving] = useState<string | null>(null)
  const [mappings, setMappings] = useState<Record<string, PendingMapping>>({})

  const uniqueDescriptions = [...new Set(unmapped.map((l) => l.charge_description))]

  function updateField(desc: string, field: keyof PendingMapping, value: string) {
    setMappings((prev) => {
      const existing = prev[desc] ?? ({} as PendingMapping)
      return {
        ...prev,
        [desc]: {
          transportation_mode: existing.transportation_mode ?? '',
          category_1: existing.category_1 ?? '',
          category_2: existing.category_2 ?? '',
          category_3: existing.category_3 ?? '',
          category_4: existing.category_4 ?? '',
          category_5: existing.category_5 ?? '',
          standardized_charge: existing.standardized_charge ?? '',
          charge_description: desc,
          [field]: value,
        } satisfies PendingMapping,
      }
    })
  }

  async function saveMapping(desc: string) {
    const mapping = mappings[desc]
    if (!mapping) return
    setSaving(desc)
    try {
      const res = await fetch('/api/invoices/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mapping, carrier }),
      })
      if (res.ok) {
        // Invalidate cache for this invoice
        await fetch(`/api/invoices/analysis?invoiceId=${invoiceId}`, { method: 'DELETE' })
        onMappingSaved?.()
      }
    } finally {
      setSaving(null)
    }
  }

  if (uniqueDescriptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Unmatched Charges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600 dark:text-green-400 text-center py-4">
            All charges are mapped.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Unmatched Charges
        </CardTitle>
        <Badge variant="destructive">{uniqueDescriptions.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {uniqueDescriptions.map((desc) => {
          const m = mappings[desc] ?? ({} as PendingMapping)
          const totalAmt = unmapped
            .filter((l) => l.charge_description === desc)
            .reduce((s, l) => s + l.charge_amount, 0)

          return (
            <div key={desc} className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{desc}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  ${totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(['standardized_charge', 'transportation_mode', 'category_1', 'category_2', 'category_3', 'category_4', 'category_5'] as (keyof PendingMapping)[]).map((field) => (
                  <Input
                    key={field}
                    placeholder={field.replace(/_/g, ' ')}
                    value={m[field] ?? ''}
                    onChange={(e) => updateField(desc, field, e.target.value)}
                    className="h-7 text-xs"
                  />
                ))}
              </div>
              <Button
                size="sm"
                disabled={saving === desc || !m.category_1}
                onClick={() => saveMapping(desc)}
                className="h-7 text-xs"
              >
                {saving === desc ? 'Saving…' : 'Save mapping'}
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
