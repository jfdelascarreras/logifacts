import { NextRequest, NextResponse } from 'next/server'

import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'
import type { FuelRateObservation } from '@/lib/pricing/ups-fuel-surcharge-history'
import { createClient } from '@/lib/supabase/server'

export type RerateInputRow = {
  tracking_number: string
  ship_date: string          // YYYY-MM-DD
  service: string            // "Ground" | "Air" | "2Day" etc.
  transport_charge: number   // base transportation charge (pre-surcharge)
  billed_fuel_surcharge: number
}

export type RerateResultRow = RerateInputRow & {
  rate_used: number | null
  expected_fuel: number | null
  variance: number | null      // billed − expected (positive = overbilled)
  flag: 'overbilled' | 'underbilled' | 'correct' | 'no_rate'
}

function findRateForDate(
  history: FuelRateObservation[],
  date: string
): { ground: number; air: number } | null {
  // History is sorted newest-first; find the entry whose effectiveDate <= ship_date
  const entry = history.find((h) => h.effectiveDate <= date)
  if (!entry) return null
  return { ground: entry.domesticGround, air: entry.domesticAir }
}

function isAirService(service: string): boolean {
  return /air|2\s*day|3\s*day|next.?day|nda|express|priority/i.test(service)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { rows?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }
  if (rows.length > 10_000) {
    return NextResponse.json({ error: 'Maximum 10,000 rows per request' }, { status: 400 })
  }

  const history = loadFuelSurchargeHistory()

  let totalBilled = 0
  let totalExpected = 0
  let flaggedOverbilled = 0
  let flaggedUnderbilled = 0
  let noRateCount = 0

  const results: RerateResultRow[] = (rows as RerateInputRow[]).map((row) => {
    const rates = findRateForDate(history, row.ship_date)

    if (!rates) {
      noRateCount++
      return { ...row, rate_used: null, expected_fuel: null, variance: null, flag: 'no_rate' }
    }

    const rate = isAirService(row.service) ? rates.air : rates.ground
    const expectedFuel = +(row.transport_charge * rate).toFixed(2)
    const variance = +(row.billed_fuel_surcharge - expectedFuel).toFixed(2)

    let flag: RerateResultRow['flag']
    if (variance > 1.0) {
      flag = 'overbilled'
      flaggedOverbilled++
    } else if (variance < -1.0) {
      flag = 'underbilled'
      flaggedUnderbilled++
    } else {
      flag = 'correct'
    }

    totalBilled += row.billed_fuel_surcharge
    totalExpected += expectedFuel

    return { ...row, rate_used: rate, expected_fuel: expectedFuel, variance, flag }
  })

  const totalVariance = +(totalBilled - totalExpected).toFixed(2)

  return NextResponse.json({
    results,
    summary: {
      total_rows: rows.length,
      total_billed_fuel: +totalBilled.toFixed(2),
      total_expected_fuel: +totalExpected.toFixed(2),
      total_variance: totalVariance,
      flagged_overbilled: flaggedOverbilled,
      flagged_underbilled: flaggedUnderbilled,
      no_rate_count: noRateCount,
      overbill_rate_pct: rows.length > 0
        ? +((flaggedOverbilled / rows.length) * 100).toFixed(1)
        : 0,
    },
  })
}
