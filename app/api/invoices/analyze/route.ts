import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { computePremiumInvoiceAnalysis, hasActiveInvoiceFilters, persistPremiumAnalysisCache } from '@/lib/premium-analysis'
import {
  invoiceRowsWriteEnabled,
  syncUpsInvoiceRows,
} from '@/lib/invoices/invoice-rows'
import {
  getAnalysisCache,
  invalidateAnalysisCache,
  setAnalysisCache,
} from '@/lib/cache/analysis-cache'
import { buildAnalysisRunRow, fetchLatestAnalysisRuns, recordAnalysisRun } from '@/lib/premium-analysis/analysis-runs'
import { compareAnalysisRunRegression } from '@/lib/premium-analysis/analysis-regression'
import { detectStaleIngest } from '@/lib/premium-analysis/stale-ingest'

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

  const startedAt = Date.now()

  const computed = await computePremiumInvoiceAnalysis(supabase, user, filtersRaw)
  const durationMs = Date.now() - startedAt
  if (!computed.ok) {
    return NextResponse.json({ error: computed.message }, { status: computed.status })
  }

  const { summaryCore, summaryForDashboard: summary, uploadsCount, upsSyncTagged } = computed.data
  const appliedFilters = summary.appliedFilters
  const filtersActive = hasActiveInvoiceFilters(appliedFilters)

  let summaryForPersist = summary
  if (!filtersActive) {
    const carriers = Object.keys(summary.byCarrier ?? {})
    const staleIngest = detectStaleIngest(summary.ingestDiagnostics?.parseVersions ?? [], carriers)
    const priorRuns = await fetchLatestAnalysisRuns(supabase, user.id, 1)
    const runRegression = priorRuns[0]
      ? compareAnalysisRunRegression(
          {
            totalCost: summary.measures.totalCost,
            shipmentCount: summary.measures.packageDedupeShipmentCount,
            lineCount: summary.totalRows,
          },
          priorRuns[0]
        )
      : null
    summaryForPersist = {
      ...summary,
      staleIngest,
      ...(runRegression ? { runRegression } : {}),
    }
  }

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
  let invoiceRowsSyncWarning: string | undefined
  let invoiceRowsSynced: number | undefined
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

    if (invoiceRowsWriteEnabled() && upsSyncTagged.length > 0) {
      const syncResult = await syncUpsInvoiceRows(supabase, user.id, upsSyncTagged)
      if (syncResult.error) {
        invoiceRowsSyncWarning = `invoice-rows sync: ${syncResult.error}`
      } else {
        invoiceRowsSynced = syncResult.rowCount
      }
    }
  }

  let analysisCacheWarning: string | undefined
  const cacheResult = await persistPremiumAnalysisCache(supabase, user.id, summaryForPersist)
  if (cacheResult.error) {
    return NextResponse.json({ error: cacheResult.error }, { status: 400 })
  }
  if (cacheResult.warning) {
    analysisCacheWarning = cacheResult.warning
  }

  // Invalidate Redis so the next GET fetches fresh data from Supabase.
  await invalidateAnalysisCache(user.id)

  await recordAnalysisRun(supabase, buildAnalysisRunRow(user.id, summaryForPersist, durationMs))

  return NextResponse.json(
    {
      uploadId: cacheResult.uploadId,
      uploadsAnalyzed: uploadsCount,
      summary: summaryForPersist,
      ...(spendSyncWarning ? { spendSyncWarning } : {}),
      ...(invoiceRowsSyncWarning ? { invoiceRowsSyncWarning } : {}),
      ...(invoiceRowsSynced != null ? { invoiceRowsSynced } : {}),
      ...(analysisCacheWarning ? { analysisCacheWarning } : {}),
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

