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
  INVOICE_HEADERS,
  applyProfileSenderCompanyName,
  filterRowsLikeClubColorsPowerQuery,
  parseInvoiceCsvText,
  type InvoiceRecord,
} from '@/lib/invoices/csv'
import { contentSha256FromStoredCsv, invoiceRowHash } from '@/lib/invoices/dedupe-hash-server'

/** Allow long runs when recomputing many large CSVs (hosting plan must support it, e.g. Vercel Pro). */
export const maxDuration = 120

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceRowRecord = {
  account_number: string | null
  invoice_date: string | null
  invoice_number: string | null
  tracking_number: string | null
  charge_category_code: string | null
  charge_category_detail_code: string | null
  charge_classification_code: string | null
  charge_description_code: string | null
  charge_description: string | null
  net_amount: string | null
  invoice_amount: string | null
  duty_amount: string | null
  billed_weight: string | null
  entered_weight: string | null
  package_quantity: string | null
  zone: string | null
  carrier_name: string | null
  original_service_description: string | null
  lead_shipment_number: string | null
  shipment_reference_number_1: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a sparse InvoiceRecord from a stored invoice_rows DB row. */
function invoiceRowToRecord(row: InvoiceRowRecord): InvoiceRecord {
  const empty = Object.fromEntries(INVOICE_HEADERS.map((h) => [h, null])) as InvoiceRecord
  return {
    ...empty,
    'Account Number': row.account_number,
    'Invoice Date': row.invoice_date,
    'Invoice Number': row.invoice_number,
    'Tracking Number': row.tracking_number,
    'Charge Category Code': row.charge_category_code,
    'Charge Category Detail Code': row.charge_category_detail_code,
    'Charge Classification Code': row.charge_classification_code,
    'Charge Description Code': row.charge_description_code,
    'Charge Description': row.charge_description,
    'Net Amount': row.net_amount,
    'Invoice Amount': row.invoice_amount,
    'Duty Amount': row.duty_amount,
    'Billed Weight': row.billed_weight,
    'Entered Weight': row.entered_weight,
    'Package Quantity': row.package_quantity,
    'Zone': row.zone,
    'Carrier Name': row.carrier_name,
    'Original Service Description': row.original_service_description,
    'Lead Shipment Number': row.lead_shipment_number,
    'Shipment Reference Number 1': row.shipment_reference_number_1,
  }
}

/** Convert an InvoiceRecord to an invoice_rows insert payload. */
function recordToInvoiceRowInsert(
  rec: InvoiceRecord,
  userId: string,
  uploadId: string
) {
  return {
    user_id: userId,
    invoice_upload_id: uploadId,
    row_hash: invoiceRowHash(rec),
    account_number: rec['Account Number'],
    invoice_date: rec['Invoice Date'],
    invoice_number: rec['Invoice Number'],
    tracking_number: rec['Tracking Number'],
    charge_category_code: rec['Charge Category Code'],
    charge_category_detail_code: rec['Charge Category Detail Code'],
    charge_classification_code: rec['Charge Classification Code'],
    charge_description_code: rec['Charge Description Code'],
    charge_description: rec['Charge Description'],
    net_amount: rec['Net Amount'],
    invoice_amount: rec['Invoice Amount'],
    duty_amount: rec['Duty Amount'],
    billed_weight: rec['Billed Weight'],
    entered_weight: rec['Entered Weight'],
    package_quantity: rec['Package Quantity'],
    zone: rec['Zone'],
    carrier_name: rec['Carrier Name'],
    original_service_description: rec['Original Service Description'],
    lead_shipment_number: rec['Lead Shipment Number'],
    shipment_reference_number_1: rec['Shipment Reference Number 1'],
  }
}

const BACKFILL_CHUNK = 500

// ---------------------------------------------------------------------------
// POST /api/invoices/analyze
// ---------------------------------------------------------------------------

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

  // Fetch upload metadata (id + hash only — no csv_text needed for analysis).
  // We still fetch csv_text here temporarily for the one-time backfill path.
  const [{ data: uploads, error: uploadError }, { data: mappings, error: mappingsError }] =
    await Promise.all([
      supabase
        .from('invoice_uploads')
        .select('id, csv_text, created_at, content_sha256')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('charge_description_mappings').select(
        'charge_description, transportation_mode, category_1, category_2, category_3, category_4, category_5'
      ),
    ])

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }
  if (!uploads || uploads.length === 0) {
    return NextResponse.json({ error: 'No invoice uploads found' }, { status: 404 })
  }

  // Backfill content_sha256 for any uploads that are missing it.
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

  // ---------------------------------------------------------------------------
  // One-time backfill: populate invoice_rows from csv_text if the table is empty.
  // After this runs once, all subsequent analyzes read from invoice_rows directly.
  // ---------------------------------------------------------------------------
  const { count: rowCount, error: countError } = await supabase
    .from('invoice_rows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 })
  }

  if ((rowCount ?? 0) === 0) {
    const profileCompanyName = String(user.user_metadata?.company_name ?? '').trim()
    for (const upload of uploads) {
      const csvText = String(upload.csv_text ?? '')
      if (!csvText) continue
      const parsed = filterRowsLikeClubColorsPowerQuery(
        applyProfileSenderCompanyName(parseInvoiceCsvText(csvText), profileCompanyName)
      )
      const rows = parsed.map((rec) => recordToInvoiceRowInsert(rec, user.id, upload.id))
      // Upsert in chunks to stay within PostgREST body limits.
      for (let i = 0; i < rows.length; i += BACKFILL_CHUNK) {
        const { error: upsertErr } = await supabase
          .from('invoice_rows')
          .upsert(rows.slice(i, i + BACKFILL_CHUNK), {
            onConflict: 'user_id,row_hash',
            ignoreDuplicates: true,
          })
        if (upsertErr) {
          return NextResponse.json(
            { error: `Backfill failed: ${upsertErr.message}` },
            { status: 400 }
          )
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Read deduplicated rows from invoice_rows (no CSV parsing needed).
  // ---------------------------------------------------------------------------
  const { data: invoiceRowsData, error: rowsError } = await supabase
    .from('invoice_rows')
    .select(
      'account_number,invoice_date,invoice_number,tracking_number,' +
      'charge_category_code,charge_category_detail_code,charge_classification_code,' +
      'charge_description_code,charge_description,net_amount,invoice_amount,duty_amount,' +
      'billed_weight,entered_weight,package_quantity,zone,carrier_name,' +
      'original_service_description,lead_shipment_number,shipment_reference_number_1'
    )
    .eq('user_id', user.id)

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 })
  }

  const profileCompanyName = String(user.user_metadata?.company_name ?? '').trim()
  const fullRecords = applyProfileSenderCompanyName(
    (invoiceRowsData ?? []).map((r) => invoiceRowToRecord(r as unknown as InvoiceRowRecord)),
    profileCompanyName
  )

  const filterMeta = buildInvoiceAnalysisFilterMeta(fullRecords)
  const records = filterInvoiceRecords(fullRecords, appliedFilters)

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 400 })
  }

  const mappingByDescription = buildChargeDescriptionLookup(mappings ?? [])
  const summaryCore = computeInvoiceAnalysisSummary(records, mappingByDescription)
  const summary = { ...summaryCore, filterMeta, appliedFilters }

  const spendRows = summaryCore.dailySpendByAccount.map((d) => ({
    user_id: user.id,
    invoice_date: d.date,
    account_number: d.accountNumber,
    total_cost: d.totalCost,
    net_spend: d.totalCost,
  }))

  // Write daily-spend cache only when no filters are active.
  let spendSyncWarning: string | undefined
  if (!filtersActive) {
    const { error: clearSpendError } = await supabase
      .from('invoice_spend_by_date')
      .delete()
      .eq('user_id', user.id)
    if (clearSpendError) {
      spendSyncWarning = `daily-spend clear: ${clearSpendError.message}`
    } else if (spendRows.length) {
      const { error: spendUpsertError } = await supabase
        .from('invoice_spend_by_date')
        .upsert(spendRows, { onConflict: 'user_id,invoice_date,account_number' })
      if (spendUpsertError) {
        spendSyncWarning = `daily-spend upsert: ${spendUpsertError.message}`
      }
    }
  }

  const latestUploadId = uploads[0].id
  const { error: upsertError } = await supabase
    .from('invoice_upload_analyses')
    .upsert(
      { user_id: user.id, invoice_upload_id: latestUploadId, summary },
      { onConflict: 'invoice_upload_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  return NextResponse.json(
    {
      uploadId: latestUploadId,
      uploadsAnalyzed: uploads.length,
      summary,
      ...(spendSyncWarning ? { spendSyncWarning } : {}),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}

// ---------------------------------------------------------------------------
// GET /api/invoices/analyze — return saved analysis history
// ---------------------------------------------------------------------------

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

  return NextResponse.json(
    { analyses: data ?? [] },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}
