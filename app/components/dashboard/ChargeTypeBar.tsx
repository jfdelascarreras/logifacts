'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InvoiceLine } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
  topN?: number
}

export function ChargeTypeBar({ lines, topN = 10 }: Props) {
  const data = useMemo(() => {
    const totals = new Map<string, number>()
    for (const l of lines) {
      const key = l.standardized_charge ?? l.charge_description
      totals.set(key, (totals.get(key) ?? 0) + l.charge_amount)
    }
    return Array.from(totals.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topN)
  }, [lines, topN])

  const max = data[0]?.amount ?? 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Top {topN} Charge Types
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="space-y-0.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate max-w-[70%]" title={d.label}>{d.label}</span>
              <span className="font-medium text-foreground">
                ${d.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(d.amount / max) * 100}%`, backgroundColor: '#F0493E' }}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        )}
      </CardContent>
    </Card>
  )
}
