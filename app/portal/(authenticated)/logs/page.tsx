import { redirect } from 'next/navigation'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { ExportButton } from './_components/export-button'
import { FilterBar, type LogFilters } from './_components/filter-bar'
import { LogsTable, type LogRow } from './_components/logs-table'

export const metadata = { title: 'Request Log — LogiFacts Portal' }

const PAGE_SIZE = 25

function parseFilters(
  params: Record<string, string | string[] | undefined>,
): LogFilters {
  function s(key: string) {
    const v = params[key]
    return typeof v === 'string' ? v.trim() : ''
  }
  return {
    from: s('from'),
    to: s('to'),
    status: s('status') || 'all',
    originZip: s('origin_zip'),
    destZip: s('dest_zip'),
    minWeight: s('min_weight'),
    maxWeight: s('max_weight'),
  }
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  const params = await searchParams
  const filters = parseFilters(params)
  const page = Math.max(1, parseInt((params.page as string) ?? '1', 10))

  // Build query with filters applied
  let q = supabase
    .from('rate_requests')
    .select(
      'id, origin_zip, destination_zip, weight_lbs, markup_pct, status, created_at, completed_at, breakdown',
      { count: 'exact' },
    )
    .eq('customer_id', ctx.customer_id)

  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00.000Z`)
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59.999Z`)
  if (filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.originZip) q = q.ilike('origin_zip', `${filters.originZip}%`)
  if (filters.destZip) q = q.ilike('destination_zip', `${filters.destZip}%`)
  if (filters.minWeight) {
    const n = Number(filters.minWeight)
    if (!isNaN(n)) q = q.gte('weight_lbs', n)
  }
  if (filters.maxWeight) {
    const n = Number(filters.maxWeight)
    if (!isNaN(n)) q = q.lte('weight_lbs', n)
  }

  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const rows = (data ?? []) as LogRow[]
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const hasFilters =
    !!filters.from ||
    !!filters.to ||
    filters.status !== 'all' ||
    !!filters.originZip ||
    !!filters.destZip ||
    !!filters.minWeight ||
    !!filters.maxWeight

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Request Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Filterable history of every API call made by your integration.
          </p>
        </div>
        <ExportButton filters={filters} />
      </div>

      <FilterBar filters={filters} />

      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} request{total !== 1 ? 's' : ''}
          {hasFilters ? ' matching filters' : ' total'}
        </p>
      )}

      <LogsTable
        rows={rows}
        total={total}
        page={page}
        pages={pages}
        hasFilters={hasFilters}
      />
    </div>
  )
}
