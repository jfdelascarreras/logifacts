'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InvoiceLine } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
}

const PALETTE = ['#12284B', '#F0493E', '#A2C7E2', '#1e40af', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

export function CategoryDrilldown({ lines }: Props) {
  const { cat1Groups, cat2Colors } = useMemo(() => {
    // Group by category_1 → category_2
    const groups = new Map<string, Map<string, number>>()
    for (const l of lines) {
      const c1 = l.category_1 ?? 'Uncategorized'
      const c2 = l.category_2 ?? 'Uncategorized'
      if (!groups.has(c1)) groups.set(c1, new Map())
      const inner = groups.get(c1)!
      inner.set(c2, (inner.get(c2) ?? 0) + l.charge_amount)
    }

    const allCat2 = [...new Set(lines.map((l) => l.category_2 ?? 'Uncategorized'))]
    const colors: Record<string, string> = {}
    allCat2.forEach((c, i) => { colors[c] = PALETTE[i % PALETTE.length] })

    const cat1Groups = Array.from(groups.entries())
      .map(([cat1, cat2Map]) => {
        const segments = Array.from(cat2Map.entries()).map(([cat2, amount]) => ({ cat2, amount }))
        const total = segments.reduce((s, x) => s + x.amount, 0)
        return { cat1, segments, total }
      })
      .sort((a, b) => b.total - a.total)

    return { cat1Groups, cat2Colors: colors }
  }, [lines])

  const maxTotal = cat1Groups[0]?.total ?? 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Category Drilldown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cat1Groups.map(({ cat1, segments, total }) => {
          const rowWidth = (total / maxTotal) * 100
          return (
            <div key={cat1} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium truncate max-w-[70%]" title={cat1}>{cat1}</span>
                <span className="text-muted-foreground">
                  ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-4 bg-muted rounded-sm overflow-hidden flex" style={{ width: `${rowWidth}%`, minWidth: '4px' }}>
                {segments.map(({ cat2, amount }) => (
                  <div
                    key={cat2}
                    title={`${cat2}: $${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    style={{
                      width: `${(amount / total) * 100}%`,
                      backgroundColor: cat2Colors[cat2] ?? '#6b7280',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
        {cat1Groups.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        )}

        {/* Legend */}
        {Object.entries(cat2Colors).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(cat2Colors).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
