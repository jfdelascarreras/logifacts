import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  buildChargeDescriptionLookup,
  buildInvoiceAnalysisFilterMeta,
  computeInvoiceAnalysisSummary,
  filterInvoiceRecords,
  hasActiveInvoiceFilters,
  normalizeInvoiceAnalysisFilters,
} from '@/lib/invoices/analysis-summary'
import {
  applyProfileSenderCompanyName,
  filterRowsLikeClubColorsPowerQuery,
  parseInvoiceCsvText,
} from '@/lib/invoices/csv'
import {
  analyzeParseCacheFingerprint,
  analyzeParseCacheKey,
  getAnalyzeParseCache,
  setAnalyzeParseCache,
} from '@/lib/invoices/analyze-parse-cache'
import { contentSha256FromStoredCsv } from '@/lib/invoices/dedupe-hash-server'

/** Allow long runs when recomputing many large CSVs (hosting plan must support it, e.g. Vercel Pro). */
export const maxDuration = 120

export async function POST(request: Request) {
  const supabase = await createClient()

  let filtersRaw: unknown
  try {
    const body = (await request.json()) as { filters?: unknown }
    filtersRaw = body?.filters
  } catch {
    filtersRaw = undefined
  }
  const appliedFilters = normalizeInvoiceAnalysisFilters(filtersRaw)
  const filtersActive = hasActiveInvoiceFilters(appliedFilters)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [{ data: uploads, error: uploadError }, { data: mappings, error: mappingsError }] = await Promise.all([
    supabase
      .from('invoice_uploads')
      .select('id, csv_text, created_at, content_sha256')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('charge_description_mappings')
      .select(
        'charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
      ),
  ])

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  if (!uploads || uploads.length === 0) {
    return NextResponse.json({ error: 'No invoice uploads found' }, { status: 404 })
  }

  const uploadsMissingHash = uploads.filter(
    (u) => !u.content_sha256 || String(u.content_sha256).length === 0
  )
  for (const u of uploadsMissingHash) {
    const csvText = String(u.csv_text ?? '')
    const content_sha256 = contentSha256FromStoredCsv(csvText)
    const { error: hashErr } = await supabase
      .from('invoice_uploads')
      .update({ content_sha256 })
      .eq('id', u.id)
    if (hashErr) {
      return NextResponse.json({ error: hashErr.message }, { status: 400 })
    }
    u.content_sha256 = content_sha256
  }

  const profileCompanyName = String(user.user_metadata?.company_name ?? '').trim()

  const parseCacheKey = analyzeParseCacheKey(user.id, analyzeParseCacheFingerprint(uploads))
  let fullRecords = getAnalyzeParseCache(parseCacheKey, profileCompanyName)
  if (!fullRecords) {
    fullRecords = applyProfileSenderCompanyName(
      filterRowsLikeClubColorsPowerQuery(
        uploads.flatMap((upload) => parseInvoiceCsvText(String(upload.csv_text ?? '')))
      ),
      profileCompanyName
    )
    setAnalyzeParseCache(parseCacheKey, profileCompanyName, fullRecords)
  }

  const filterMeta = buildInvoiceAnalysisFilterMeta(fullRecords)
  const records = filterInvoiceRecords(fullRecords, appliedFilters)

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 400 })
  }

  const mappingByDescription = buildChargeDescriptionLookup(mappings ?? [])

  const summaryCore = computeInvoiceAnalysisSummary(records, mappingByDescription)
  const summary = {
    ...summaryCore,
    filterMeta,
    appliedFilters,
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

  if (!filtersActive) {
    const { error: clearSpendError } = await supabase
      .from('invoice_spend_by_date')
      .delete()
      .eq('user_id', user.id)
    if (clearSpendError) {
      return NextResponse.json({ error: clearSpendError.message }, { status: 400 })
    }

    if (spendRows.length) {
      const { error: spendUpsertError } = await supabase
        .from('invoice_spend_by_date')
        .upsert(spendRows, { onConflict: 'user_id,invoice_date,account_number' })
      if (spendUpsertError) {
        return NextResponse.json({ error: spendUpsertError.message }, { status: 400 })
      }
    }
  }

  // Upsert into analysis table against the most recent upload ID.
  // We still keep this as a cache row while summary itself is aggregated across all uploads.
  const latestUploadId = uploads[0].id
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

  return NextResponse.json({
    uploadId: latestUploadId,
    uploadsAnalyzed: uploads.length,
    summary,
  })
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

  const { data, error } = await supabase
    .from('invoice_upload_analyses')
    .select('id, invoice_upload_id, created_at, updated_at, summary')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ analyses: data ?? [] })
}

