import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/cache/redis'
import type { AnalysisFilters, InvoiceLine } from '@/types/invoice'

export const maxDuration = 60

function hashFilters(filters: AnalysisFilters): string {
  return Buffer.from(JSON.stringify(filters, Object.keys(filters).sort())).toString('base64url')
}

function cacheKey(userId: string, invoiceId: string, filterHash: string): string {
  return `invoice_analysis:${userId}:${invoiceId}:${filterHash}`
}

function parseFilters(url: URL): AnalysisFilters {
  const filters: AnalysisFilters = {}
  const carriers = url.searchParams.getAll('carrier')
  if (carriers.length) filters.carrier = carriers as AnalysisFilters['carrier']
  const charges = url.searchParams.getAll('standardized_charge')
  if (charges.length) filters.standardized_charge = charges
  const cat1 = url.searchParams.getAll('category_1')
  if (cat1.length) filters.category_1 = cat1
  const cat2 = url.searchParams.getAll('category_2')
  if (cat2.length) filters.category_2 = cat2
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  if (dateFrom || dateTo) filters.shipment_date_range = [dateFrom, dateTo]
  const zones = url.searchParams.getAll('zone')
  if (zones.length) filters.zone = zones
  const states = url.searchParams.getAll('destination_state')
  if (states.length) filters.destination_state = states
  const mapped = url.searchParams.get('mapped')
  if (mapped !== null) filters.mapped = mapped === 'true'
  return filters
}


export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const invoiceId = url.searchParams.get('invoiceId')
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  const filters = parseFilters(url)
  const fHash = hashFilters(filters)
  const key = cacheKey(user.id, invoiceId, fHash)

  // 1. Check Redis
  if (redis) {
    try {
      const cached = await redis.get<InvoiceLine[]>(key)
      if (cached) {
        return NextResponse.json({ data: cached, source: 'cache' })
      }
    } catch {
      // fall through to Supabase
    }
  }

  // 2. Cache miss → query Supabase invoice_lines
  let query = supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)

  if (filters.carrier?.length) query = query.in('carrier', filters.carrier)
  if (filters.standardized_charge?.length) query = query.in('standardized_charge', filters.standardized_charge)
  if (filters.category_1?.length) query = query.in('category_1', filters.category_1)
  if (filters.category_2?.length) query = query.in('category_2', filters.category_2)
  if (filters.zone?.length) query = query.in('zone', filters.zone)
  if (filters.destination_state?.length) query = query.in('destination_state', filters.destination_state)
  if (filters.mapped !== undefined) query = query.eq('mapped', filters.mapped)
  if (filters.shipment_date_range?.[0]) query = query.gte('shipment_date', filters.shipment_date_range[0])
  if (filters.shipment_date_range?.[1]) query = query.lte('shipment_date', filters.shipment_date_range[1])

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 3. Cache result
  if (redis && data) {
    try {
      await redis.set(key, data, { ex: 3600 })
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ data: data ?? [], source: 'db' })
}

/** Invalidate all Redis keys for an invoice when master_mapping is updated */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const invoiceId = url.searchParams.get('invoiceId')
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  if (redis) {
    try {
      // Scan and delete all keys matching this invoice
      let cursor = 0
      do {
        const result = await redis.scan(cursor, { match: `invoice_analysis:${user.id}:${invoiceId}:*`, count: 100 })
        cursor = Number(result[0])
        const keys = result[1]
        if (keys.length) await redis.del(...keys)
      } while (cursor !== 0)
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ ok: true })
}
