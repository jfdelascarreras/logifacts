'use client'

import { cn } from '@/lib/utils'
import type { CustomerRow } from './customers-shell'

function StatusBadge({ hasActiveKey }: { hasActiveKey: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        hasActiveKey
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {hasActiveKey ? 'Active' : 'No key'}
    </span>
  )
}

function DiscountBadge({ hasDiscounts }: { hasDiscounts: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        hasDiscounts ? 'text-foreground' : 'text-amber-600 dark:text-amber-400',
      )}
    >
      {hasDiscounts ? '✓ Set' : '⚠ Missing'}
    </span>
  )
}

function ReadinessBadge({ isReady }: { isReady: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
      )}
    >
      {isReady ? '✓ Ready' : '● Not ready'}
    </span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function CustomerTable({
  customers,
  selectedId,
  onSelect,
}: {
  customers: CustomerRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 px-6 py-16 text-center">
        <p className="font-medium text-foreground">No customers yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Click &ldquo;New Customer&rdquo; to provision your first API customer.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {['Name', 'ID', 'Key Prefix', 'Status', 'Discounts', 'Last Active', 'Readiness'].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((c) => (
            <tr
              key={c.customer_id}
              onClick={() => onSelect(c.customer_id)}
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted/30',
                selectedId === c.customer_id && 'bg-muted/20',
              )}
            >
              <td className="px-4 py-3 font-medium text-foreground">{c.name ?? c.customer_id}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {c.customer_id}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-foreground">
                {c.keyPrefix ? `lf_${c.keyPrefix}` : '—'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge hasActiveKey={c.hasActiveKey} />
              </td>
              <td className="px-4 py-3">
                <DiscountBadge hasDiscounts={c.hasDiscounts} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(c.lastActive)}</td>
              <td className="px-4 py-3">
                <ReadinessBadge isReady={c.isReady} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
