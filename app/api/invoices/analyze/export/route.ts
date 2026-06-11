import { createClient } from '@/lib/supabase/server'
import { computePremiumInvoiceAnalysis } from '@/lib/invoices/premium-analysis-compute'
import { generatePremiumAnalysisExcel } from '@/lib/invoices/premium-analysis-exporter'

export const maxDuration = 120

/**
 * POST body optional: `{ filters }` — same shape as POST /api/invoices/analyze.
 * Returns .xlsx matching current Premium Analysis KPIs + tables (+ Charge Lines sheet).
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  let filtersRaw: unknown
  try {
    const body = (await request.json()) as { filters?: unknown }
    filtersRaw = body?.filters
  } catch {
    filtersRaw = undefined
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const computed = await computePremiumInvoiceAnalysis(supabase, user, filtersRaw)
  if (!computed.ok) {
    return Response.json({ error: computed.message }, { status: computed.status })
  }

  const { summaryCore, summaryForDashboard, records, mappingByDescription, uploadsCount } = computed.data

  const buffer = await generatePremiumAnalysisExcel({
    summary: summaryCore,
    periodMatrix: summaryForDashboard.periodMatrix ?? null,
    appliedFilters: summaryForDashboard.appliedFilters ?? null,
    uploadsAnalyzed: uploadsCount,
    records,
    mappingLookup: mappingByDescription,
  })

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const filename = `premium-analysis_${stamp}.xlsx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
