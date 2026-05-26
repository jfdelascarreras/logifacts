'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InvoiceLine } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
}

const CARRIER_COLORS: Record<string, string> = {
  UPS: '#F0493E',
  FedEx: '#12284B',
  WWE: '#A2C7E2',
}

export function CarrierBreakdown({ lines }: Props) {
  const data = useMemo(() => {
    const totals = new Map<string, number>()
    for (const l of lines) {
      totals.set(l.carrier, (totals.get(l.carrier) ?? 0) + l.charge_amount)
    }
    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0)
    return Array.from(totals.entries())
      .map(([carrier, amount]) => ({ carrier, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [lines])

  const totalSpend = data.reduce((s, d) => s + d.amount, 0)

  // Build conic-gradient segments — accumulate with reduce to avoid mutation
  const segments = useMemo(() =>
    data.reduce<{ acc: number; parts: string[] }>(
      ({ acc, parts }, d) => {
        const color = CARRIER_COLORS[d.carrier] ?? '#6b7280'
        const next = acc + d.pct
        return { acc: next, parts: [...parts, `${color} ${acc.toFixed(1)}% ${next.toFixed(1)}%`] }
      },
      { acc: 0, parts: [] }
    ).parts
  , [data])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Spend by Carrier
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-8">
        <div className="relative flex-shrink-0">
          <div
            className="w-32 h-32 rounded-full"
            style={{ background: segments.length ? `conic-gradient(${segments.join(', ')})` : '#e5e7eb' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-card" />
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {data.map((d) => (
            <div key={d.carrier} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: CARRIER_COLORS[d.carrier] ?? '#6b7280' }}
              />
              <span className="font-medium w-12">{d.carrier}</span>
              <span className="text-muted-foreground ml-auto">
                ${d.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground w-12 text-right">{d.pct.toFixed(1)}%</span>
            </div>
          ))}
          <div className="mt-1 pt-1 border-t text-sm font-semibold flex justify-between">
            <span>Total</span>
            <span>${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
