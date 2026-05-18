import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { hasActiveInvoiceFilters } from '@/lib/invoices/analysis-summary'
import { computePremiumInvoiceAnalysis } from '@/lib/invoices/premium-analysis-compute'
import {
  getAnalysisCache,
  invalidateAnalysisCache,
  setAnalysisCache,
} from '@/lib/cache/analysis-cache'

/** Allow long runs when recomputing many large CSVs (hosting plan must support it, e.g. Vercel Pro). */
export const maxDuration = 120

/** Keeps each PostgREST upsert under Postgres `statement_timeout` when dailySpendByAccount has many rows. */
const SPEND_UPSERT_CHUNK_SIZE = 400

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
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const computed = await computePremiumInvoiceAnalysis(supabase, user, filtersRaw)
  if (!computed.ok) {
    return NextResponse.json({ error: computed.message }, { status: computed.status })
  }

  const { summaryCore, summaryForDashboard: summary, uploadsCount } = computed.data
  const appliedFilters = summary.appliedFilters
  const filtersActive = hasActiveInvoiceFilters(appliedFilters)

  const spendRows: Array<{
    user_id: string
    invoice_date: string
    account_number: string
    total_cost: number
    net_spend: number
  }> = summaryCore.dailySpendByAccount.map((d) => ({
    user_id: user.id,
    invoice_date: d.date,
    account_number: d.accountNumber,
    total_cost: d.totalCost,
    net_spend: d.totalCost,
  }))

  // Write daily-spend cache only when no filters are active.
  // Failures here are non-fatal: the dashboard reads invoice_upload_analyses, not this table.
  // A missing `account_number` column (migration not yet applied) should not block the refresh.
  let spendSyncWarning: string | undefined
  if (!filtersActive) {
    const { error: clearSpendError } = await supabase
      .from('invoice_spend_by_date')
      .delete()
      .eq('user_id', user.id)
    if (clearSpendError) {
      spendSyncWarning = `daily-spend clear: ${clearSpendError.message}`
    } else if (spendRows.length) {
      let spendUpsertError: { message: string } | null = null
      for (let i = 0; i < spendRows.length; i += SPEND_UPSERT_CHUNK_SIZE) {
        const chunk = spendRows.slice(i, i + SPEND_UPSERT_CHUNK_SIZE)
        const { error: chunkErr } = await supabase
          .from('invoice_spend_by_date')
          .upsert(chunk, { onConflict: 'user_id,invoice_date,account_number' })
        if (chunkErr) {
          spendUpsertError = chunkErr
          break
        }
      }
      if (spendUpsertError) {
        spendSyncWarning = `daily-spend upsert: ${spendUpsertError.message}`
      }
    }
  }

  const {
    data: latestUpload,
    error: latestUploadErr,
  } = await supabase
    .from('invoice_uploads')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestUploadErr || !latestUpload?.id) {
    return NextResponse.json({ error: latestUploadErr?.message ?? 'No invoice uploads found' }, { status: 404 })
  }

  const latestUploadId = latestUpload.id

  // Upsert into analysis table against the most recent upload ID.
  // We still keep this as a cache row while summary itself is aggregated across all uploads.
  const { error: upsertError } = await supabase
    .from('invoice_upload_analyses')
    .upsert(
      {
        user_id: user.id,
        invoice_upload_id: latestUploadId,
        summary,
      },
      { onConflict: 'invoice_upload_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  // Invalidate Redis so the next GET fetches fresh data from Supabase.
  await invalidateAnalysisCache(user.id)

  return NextResponse.json(
    {
      uploadId: latestUploadId,
      uploadsAnalyzed: uploadsCount,
      summary,
      ...(spendSyncWarning ? { spendSyncWarning } : {}),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    }
  )
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Redis cache check — skip Supabase on hit.
  const cached = await getAnalysisCache(user.id)
  if (cached) {
    return NextResponse.json({ analyses: cached }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const { data, error } = await supabase
    .from('invoice_upload_analyses')
    .select('id, invoice_upload_id, created_at, updated_at, summary')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const analyses = data ?? []

  // Populate Redis for subsequent GET requests.
  await setAnalysisCache(user.id, analyses)

  return NextResponse.json({ analyses }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

