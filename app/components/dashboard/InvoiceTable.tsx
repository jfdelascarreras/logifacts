'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { InvoiceLine } from '@/types/invoice'

interface Props {
  lines: InvoiceLine[]
  pageSize?: number
}

export function InvoiceTable({ lines, pageSize = 50 }: Props) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return lines
    const q = search.toLowerCase()
    return lines.filter(
      (l) =>
        l.charge_description.toLowerCase().includes(q) ||
        (l.standardized_charge ?? '').toLowerCase().includes(q) ||
        (l.category_1 ?? '').toLowerCase().includes(q) ||
        l.carrier.toLowerCase().includes(q)
    )
  }, [lines, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize)

  function fmt(v: number) {
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Invoice Lines
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="h-7 w-48 text-xs"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length.toLocaleString()} rows
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Carrier', 'Charge Description', 'Standardized', 'Category 1', 'Amount', 'Date', 'Zone', 'State', 'Status'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((l) => (
                <tr key={l.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-1.5 font-medium">{l.carrier}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate" title={l.charge_description}>{l.charge_description}</td>
                  <td className="px-3 py-1.5 max-w-[150px] truncate text-muted-foreground" title={l.standardized_charge ?? ''}>
                    {l.standardized_charge ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.category_1 ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-right">{fmt(l.charge_amount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.shipment_date ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.zone ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.destination_state ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={l.mapped ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
                      {l.mapped ? 'mapped' : 'unmatched'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 text-xs"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
