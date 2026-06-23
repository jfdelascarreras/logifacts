import { NextResponse } from 'next/server'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 25

type Row = {
  id: string
  origin_zip: string
  destination_zip: string
  weight_lbs: number
  markup_pct: number
  status: string
  created_at: string
  completed_at: string | null
  breakdown: unknown
}

function n(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

function getCarrierPart(breakdown: unknown, carrier: 'ups' | 'fedex'): Record<string, unknown> | null {
  if (!breakdown || typeof breakdown !== 'object') return null
  const part = (breakdown as Record<string, unknown>)[carrier]
  return part && typeof part === 'object' ? (part as Record<string, unknown>) : null
}

function getDisplayRate(breakdown: unknown, carrier: 'ups' | 'fedex', markupPct: number): number | null {
  const p = getCarrierPart(breakdown, carrier)
  if (!p) return null
  if (typeof p.error === 'string') return null
  // External API format: final_rate already includes markup
  if (typeof p.final_rate === 'number') return p.final_rate
  // Portal format: totalEstimatedCharge is pre-markup
  if (typeof p.totalEstimatedCharge === 'number') {
    return Math.round((p.totalEstimatedCharge * (1 + markupPct / 100)) * 100) / 100
  }
  return null
}

function getBilledWeight(breakdown: unknown): number | null {
  for (const carrier of ['ups', 'fedex'] as const) {
    const p = getCarrierPart(breakdown, carrier)
    if (!p || typeof p.error === 'string') continue
    const w = p.billed_weight_lbs ?? p.billableWeightLbs
    if (typeof w === 'number') return w
  }
  return null
}

function buildCsv(rows: Row[]): string {
  const HEADERS = [
    'Request ID',
    'Timestamp',
    'Origin ZIP',
    'Dest ZIP',
    'Weight (lbs)',
    'Billed Weight (lbs)',
    'UPS Final Rate',
    'FedEx Final Rate',
    'Status',
  ]

  function cell(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
  }

  const lines: string[] = [HEADERS.map(cell).join(',')]

  for (const r of rows) {
    const mPct = n(r.markup_pct)
    const upsRate = getDisplayRate(r.breakdown, 'ups', mPct)
    const fedexRate = getDisplayRate(r.breakdown, 'fedex', mPct)
    const billedWeight = getBilledWeight(r.breakdown)

    lines.push(
      [
        r.id,
        r.created_at,
        r.origin_zip,
        r.destination_zip,
        r.weight_lbs,
        billedWeight ?? '',
        upsRate !== null ? upsRate.toFixed(2) : '',
        fedexRate !== null ? fedexRate.toFixed(2) : '',
        r.status,
      ]
        .map(cell)
        .join(','),
    )
  }

  return lines.join('\r\n')
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getCustomerContext(user.id)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? undefined
  const to = sp.get('to') ?? undefined
  const statusFilter = sp.get('status') ?? 'all'
  const originZip = sp.get('origin_zip') ?? undefined
  const destZip = sp.get('dest_zip') ?? undefined
  const rawMinWeight = sp.get('min_weight')
  const rawMaxWeight = sp.get('max_weight')
  const minWeight = rawMinWeight ? Number(rawMinWeight) : undefined
  const maxWeight = rawMaxWeight ? Number(rawMaxWeight) : undefined
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const format = sp.get('format')

  let q = supabase
    .from('rate_requests')
    .select(
      'id, origin_zip, destination_zip, weight_lbs, markup_pct, status, created_at, completed_at, breakdown',
      { count: 'exact' },
    )
    .eq('customer_id', ctx.customer_id)

  if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`)
  if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`)
  if (statusFilter !== 'all') q = q.eq('status', statusFilter)
  if (originZip) q = q.ilike('origin_zip', `${originZip}%`)
  if (destZip) q = q.ilike('destination_zip', `${destZip}%`)
  if (minWeight !== undefined && !isNaN(minWeight)) q = q.gte('weight_lbs', minWeight)
  if (maxWeight !== undefined && !isNaN(maxWeight)) q = q.lte('weight_lbs', maxWeight)

  q = q.order('created_at', { ascending: false })

  if (format === 'csv') {
    const { data } = await q
    const csv = buildCsv((data ?? []) as Row[])
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="logifacts-requests.csv"`,
      },
    })
  }

  const { data, count, error } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return NextResponse.json({ rows: data ?? [], total, page, pages })
}
