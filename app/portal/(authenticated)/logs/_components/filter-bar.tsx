'use client'

import { type FormEvent, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type LogFilters = {
  from: string
  to: string
  status: string
  originZip: string
  destZip: string
  minWeight: string
  maxWeight: string
}

export function FilterBar({ filters }: { filters: LogFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [status, setStatus] = useState(filters.status)
  // resetKey forces uncontrolled inputs to re-mount when cleared
  const [resetKey, setResetKey] = useState(0)

  const hasActiveFilters =
    filters.from ||
    filters.to ||
    filters.status !== 'all' ||
    filters.originZip ||
    filters.destZip ||
    filters.minWeight ||
    filters.maxWeight

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const params = new URLSearchParams()

    const textFields: Array<[string, string]> = [
      ['from', 'from'],
      ['to', 'to'],
      ['origin_zip', 'origin_zip'],
      ['dest_zip', 'dest_zip'],
      ['min_weight', 'min_weight'],
      ['max_weight', 'max_weight'],
    ]
    for (const [formName, paramName] of textFields) {
      const val = fd.get(formName)?.toString().trim()
      if (val) params.set(paramName, val)
    }
    if (status !== 'all') params.set('status', status)

    router.push(`${pathname}?${params.toString()}`)
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setStatus(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function handleClear() {
    setStatus('all')
    setResetKey((k) => k + 1)
    router.push(pathname)
  }

  return (
    <form
      key={resetKey}
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap gap-3">
        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {/* Status */}
        <select
          value={status}
          onChange={handleStatusChange}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </select>

        {/* Origin ZIP */}
        <input
          type="text"
          name="origin_zip"
          placeholder="Origin ZIP"
          defaultValue={filters.originZip}
          maxLength={5}
          className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        />

        {/* Dest ZIP */}
        <input
          type="text"
          name="dest_zip"
          placeholder="Dest ZIP"
          defaultValue={filters.destZip}
          maxLength={5}
          className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        />

        {/* Weight range */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            name="min_weight"
            placeholder="Min lbs"
            defaultValue={filters.minWeight}
            min={0}
            step={0.1}
            className="h-8 w-20 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="number"
            name="max_weight"
            placeholder="Max lbs"
            defaultValue={filters.maxWeight}
            min={0}
            step={0.1}
            className="h-8 w-20 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
              Clear
            </button>
          )}
          <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5">
            <FilterIcon className="size-3" />
            Apply
          </Button>
        </div>
      </div>
    </form>
  )
}
