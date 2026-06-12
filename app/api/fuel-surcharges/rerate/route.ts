import { NextRequest, NextResponse } from 'next/server'

import { loadFuelSurchargeHistory } from '@/lib/pricing/ups-fuel-surcharge-history'
import {
  rerateFuelRow,
  type FuelRerateInput,
  type FuelRerateResult,
} from '@/lib/pricing/fuel-rerate'
import { createClient } from '@/lib/supabase/server'

export type RerateInputRow = FuelRerateInput
export type RerateResultRow = FuelRerateResult

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
    const result = rerateFuelRow(row, history)
    if (result.flag === 'no_rate') noRateCount++
    if (result.flag === 'overbilled') flaggedOverbilled++
    if (result.flag === 'underbilled') flaggedUnderbilled++
    if (result.expected_fuel != null) {
      totalBilled += row.billed_fuel_surcharge
      totalExpected += result.expected_fuel
    }
    return result
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
