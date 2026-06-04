import { NextResponse } from 'next/server'

import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'
import type { FuelRateObservation } from '@/lib/pricing/ups-fuel-surcharge-history'
import { createClient } from '@/lib/supabase/server'
import { parseUPS } from '@/lib/invoices/parsers/ups'
import { normalizeChargeDescriptionForLookup } from '@/lib/invoices/mapping'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceFuelRow = {
  week: string
  carrier: string
  billed_fuel: number
  billed_transport: number | null
  implied_rate: number | null
  published_rate: number | null
  variance_dollars: number | null
  flag: 'overbilled' | 'underbilled' | 'correct' | 'no_transport' | 'no_rate'
}

export type InvoiceFuelSummary = {
  total_fuel_billed: number
  total_transport_billed: number
  weeks_analyzed: number
  weeks_overbilled: number
  total_overbilled_dollars: number
  avg_implied_rate: number | null
  carriers: string[]
  date_range: { from: string; to: string } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function findPublishedRate(history: FuelRateObservation[], date: string): number | null {
  const entry = history.find((h) => h.effectiveDate <= date)
  return entry ? entry.domesticGround : null
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const history = loadFuelSurchargeHistory()

  // ── 1. UPS: parse raw CSVs from invoice_uploads ─────────────────────────

  // Load master_mapping fuel descriptors for UPS
  const { data: mappings } = await supabase
    .from('master_mapping')
    .select('charge_description, category_3, charge_classification_code')
    .eq('carrier', 'UPS')

  const fuelDescSet = new Set(
    (mappings ?? [])
      .filter((m: { category_3: string | null }) =>
        m.category_3?.toUpperCase().trim() === 'FUEL SURCHARGE'
      )
      .map((m: { charge_description: string }) =>
        normalizeChargeDescriptionForLookup(m.charge_description)
      )
  )

  // Fetch UPS uploads (last 50, grab csv_text)
  const { data: uploads } = await supabase
    .from('invoice_uploads')
    .select('id, csv_text')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  type WeekBucket = { fuel: number; transport: number; carrier: string }
  const buckets = new Map<string, WeekBucket>()

  function addToBucket(week: string, carrier: string, fuel: number, transport: number) {
    const key = `${week}:${carrier}`
    const b = buckets.get(key) ?? { fuel: 0, transport: 0, carrier }
    b.fuel += fuel
    b.transport += transport
    buckets.set(key, b)
  }

  for (const upload of uploads ?? []) {
    if (!upload.csv_text) continue
    let lines
    try {
      lines = parseUPS(Buffer.from(upload.csv_text as string, 'utf-8'))
    } catch {
      continue
    }

    for (const line of lines) {
      const date = line.shipment_date || line.invoice_date
      if (!date || line.charge_amount === 0) continue
      const week = toMonday(date)
      const descNorm = normalizeChargeDescriptionForLookup(line.charge_description)

      if (fuelDescSet.has(descNorm)) {
        addToBucket(week, 'UPS', line.charge_amount, 0)
      } else if (line.charge_classification_code === 'FRT') {
        addToBucket(week, 'UPS', 0, line.charge_amount)
      }
    }
  }

  // ── 2. FedEx/WWE: query invoice_lines (enriched pipeline) ───────────────

  const [fedexFuelResult, fedexTransportResult] = await Promise.all([
    supabase
      .from('invoice_lines')
      .select('reference_1, shipment_date, charge_amount, carrier')
      .ilike('category_3', '%FUEL%')
      .order('shipment_date', { ascending: false })
      .limit(5000),
    supabase
      .from('invoice_lines')
      .select('reference_1, shipment_date, charge_amount, carrier')
      .eq('charge_classification_code', 'FRT')
      .order('shipment_date', { ascending: false })
      .limit(5000),
  ])

  // Build transport lookup by reference_1 for pairing
  const fedexTransportByRef = new Map<string, { amount: number; carrier: string }>()
  for (const row of fedexTransportResult.data ?? []) {
    const r = row as { reference_1: string | null; charge_amount: number; carrier: string }
    if (r.reference_1) {
      fedexTransportByRef.set(r.reference_1, {
        amount: (fedexTransportByRef.get(r.reference_1)?.amount ?? 0) + r.charge_amount,
        carrier: r.carrier,
      })
    }
  }

  for (const row of fedexFuelResult.data ?? []) {
    const r = row as { reference_1: string | null; shipment_date: string | null; charge_amount: number; carrier: string }
    if (!r.shipment_date) continue
    const week = toMonday(r.shipment_date)
    const transport = r.reference_1 ? (fedexTransportByRef.get(r.reference_1)?.amount ?? 0) : 0
    addToBucket(week, r.carrier ?? 'FedEx', r.charge_amount, transport)
  }

  // ── 3. Build result rows ─────────────────────────────────────────────────

  const rows: InvoiceFuelRow[] = []

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.fuel === 0) continue // skip transport-only buckets

    const week = key.split(':')[0]!
    const publishedRate = findPublishedRate(history, week)
    const impliedRate = bucket.transport > 0 ? bucket.fuel / bucket.transport : null
    const expectedFuel =
      publishedRate != null && bucket.transport > 0
        ? bucket.transport * publishedRate
        : null
    const varianceDollars =
      expectedFuel != null ? +(bucket.fuel - expectedFuel).toFixed(2) : null

    let flag: InvoiceFuelRow['flag']
    if (bucket.transport === 0) flag = 'no_transport'
    else if (publishedRate == null) flag = 'no_rate'
    else if (varianceDollars != null && varianceDollars > 5) flag = 'overbilled'
    else if (varianceDollars != null && varianceDollars < -5) flag = 'underbilled'
    else flag = 'correct'

    rows.push({
      week,
      carrier: bucket.carrier,
      billed_fuel: +bucket.fuel.toFixed(2),
      billed_transport: bucket.transport > 0 ? +bucket.transport.toFixed(2) : null,
      implied_rate: impliedRate != null ? +impliedRate.toFixed(4) : null,
      published_rate: publishedRate,
      variance_dollars: varianceDollars,
      flag,
    })
  }

  // Sort by week descending
  rows.sort((a, b) => b.week.localeCompare(a.week))

  // ── 4. Summary ────────────────────────────────────────────────────────────

  const overbilledRows = rows.filter((r) => r.flag === 'overbilled')
  const ratedRows = rows.filter((r) => r.implied_rate != null)
  const totalFuel = rows.reduce((s, r) => s + r.billed_fuel, 0)
  const totalTransport = rows.reduce((s, r) => s + (r.billed_transport ?? 0), 0)
  const allWeeks = rows.map((r) => r.week).filter(Boolean)

  const summary: InvoiceFuelSummary = {
    total_fuel_billed: +totalFuel.toFixed(2),
    total_transport_billed: +totalTransport.toFixed(2),
    weeks_analyzed: rows.length,
    weeks_overbilled: overbilledRows.length,
    total_overbilled_dollars: +overbilledRows
      .reduce((s, r) => s + (r.variance_dollars ?? 0), 0)
      .toFixed(2),
    avg_implied_rate:
      ratedRows.length > 0
        ? +(ratedRows.reduce((s, r) => s + (r.implied_rate ?? 0), 0) / ratedRows.length).toFixed(4)
        : null,
    carriers: [...new Set(rows.map((r) => r.carrier))],
    date_range:
      allWeeks.length > 0
        ? { from: allWeeks[allWeeks.length - 1]!, to: allWeeks[0]! }
        : null,
  }

  return NextResponse.json({ rows, summary })
}
