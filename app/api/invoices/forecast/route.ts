import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { forecastFuelSurcharge } from '@/lib/invoices/forecasting'
import {
  loadFuelSurchargeHistory,
  deriveFuelScenarios,
  type FuelSurchargeType,
} from '@/lib/pricing/ups-fuel-surcharge-history'

const VALID_SURCHARGE_TYPES: FuelSurchargeType[] = [
  'all',
  'domesticGround',
  'domesticAir',
  'intlAirExport',
  'intlAirImport',
  'intlGroundExportImport',
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    monthlySpend: bodyMonthlySpend,
    horizon,
    holdoutPeriods,
    customRate,
    surchargeType: bodySurchargeType,
    isFiltered,
  } = body as Record<string, unknown>

  const surchargeType: FuelSurchargeType =
    typeof bodySurchargeType === 'string' && VALID_SURCHARGE_TYPES.includes(bodySurchargeType as FuelSurchargeType)
      ? (bodySurchargeType as FuelSurchargeType)
      : 'domesticGround'

  // Resolve monthlySpend: body first, fallback to latest saved analysis
  let monthlySpend = Array.isArray(bodyMonthlySpend) ? bodyMonthlySpend : null
  const extraWarnings: string[] = []

  if (!monthlySpend || monthlySpend.length === 0) {
    const { data } = await supabase
      .from('invoice_upload_analyses')
      .select('summary')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const summary = data?.summary as Record<string, unknown> | null
    const stored = Array.isArray(summary?.monthlySpend) ? summary.monthlySpend : null
    if (stored && stored.length > 0) {
      monthlySpend = stored
      extraWarnings.push('using_stored_analysis')
    } else {
      return NextResponse.json(
        { error: 'No invoice analysis found. Run an analysis first.' },
        { status: 422 }
      )
    }
  }

  // Load rate history and derive scenarios
  const rateHistory = loadFuelSurchargeHistory()
  const scenarios = deriveFuelScenarios(rateHistory, surchargeType)

  // Override current scenario with custom rate if provided
  if (typeof customRate === 'number' && customRate > 0 && customRate <= 1) {
    scenarios.current = customRate
  }

  const parsedHorizon = typeof horizon === 'number' && horizon > 0 ? Math.min(horizon, 12) : 3
  const parsedHoldout = typeof holdoutPeriods === 'number' && holdoutPeriods > 0 ? holdoutPeriods : undefined

  const result = forecastFuelSurcharge(monthlySpend, scenarios, {
    horizon: parsedHorizon,
    holdoutPeriods: parsedHoldout,
  })

  if (isFiltered) result.warnings.push('filtered_data')
  result.warnings.push(...extraWarnings)

  return NextResponse.json(
    { ...result, surchargeType, scenarioRates: scenarios },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}
