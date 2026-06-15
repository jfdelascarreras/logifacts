import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectCarrierFromBuffer, parseInvoice } from '@/lib/invoices/parsers'
import { mapInvoiceLines } from '@/lib/invoices/mapping'
import { syncMultipartInvoiceRows } from '@/lib/invoices/invoice-rows'
import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'
import { invalidateParseIngestCacheForUser } from '@/lib/cache/parse-ingest-cache'
import { invalidateAnalysisCache } from '@/lib/cache/analysis-cache'
import { retainRawInvoiceFile } from '@/lib/invoices/raw-invoice-files'

export const maxDuration = 120

/**
 * Recursively strip null bytes and non-printable control characters from every
 * string value in an object before it reaches Postgres.
 * Postgres rejects \u0000 in text columns unconditionally.
 */
function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\u0000/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    } else {
      out[k] = v
    }
  }
  return out as T
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const filename = (file instanceof File ? file.name : 'invoice').replace(/\u0000/g, '')
  const buffer = Buffer.from(await file.arrayBuffer())

  // 1. Detect carrier from file content (magic bytes + row-1 header scan), filename fallback
  const detection = await detectCarrierFromBuffer(filename, buffer)

  if (detection.carrier === null) {
    return NextResponse.json(
      {
        error:
          'Could not identify the carrier from this file. ' +
          'For UPS: upload the CSV (250 Columns) from UPS Billing Center → My Plan Invoices → three-dot menu. ' +
          'For FedEx or WWE: upload the standard Excel invoice file.',
      },
      { status: 422 }
    )
  }

  const carrier = detection.carrier

  // 2. Parse invoice lines
  let lines
  try {
    lines = await parseInvoice(carrier, buffer)
  } catch (err) {
    return NextResponse.json(
      { error: `Parse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 }
    )
  }

  if (lines.length === 0) {
    return NextResponse.json({ error: 'No charge lines found in file' }, { status: 422 })
  }

  // 3. Extract invoice metadata from first row with data
  const firstLine = lines.find((l) => l.invoice_date || l.invoice_number)
  const invoiceNumber = firstLine?.invoice_number ?? null
  const invoiceDate = firstLine?.invoice_date ?? null
  const totalAmount = lines.reduce((sum, l) => sum + l.charge_amount, 0)

  // 4. Insert invoice record
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from('invoices')
    .insert(sanitizeRow({
      user_id: user.id,
      carrier,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      filename,
      upload_status: 'pending',
      total_amount: totalAmount,
    }))
    .select('id')
    .single()

  if (invoiceError || !invoiceRow) {
    return NextResponse.json(
      { error: invoiceError?.message ?? 'Failed to create invoice record' },
      { status: 500 }
    )
  }

  const invoiceId = invoiceRow.id

  // 5. Map lines against master_mapping
  const mappedLines = await mapInvoiceLines(lines, invoiceId, carrier, supabase)

  // 6. Bulk insert invoice_lines in chunks of 500
  const CHUNK = 500
  for (let i = 0; i < mappedLines.length; i += CHUNK) {
    const chunk = mappedLines.slice(i, i + CHUNK).map(sanitizeRow)
    const { error: linesError } = await supabase.from('invoice_lines').insert(chunk)
    if (linesError) {
      await supabase.from('invoices').update({ upload_status: 'error' }).eq('id', invoiceId)
      return NextResponse.json({ error: linesError.message }, { status: 500 })
    }
  }

  // 7. Mark invoice as processed
  await supabase.from('invoices').update({ upload_status: 'processed' }).eq('id', invoiceId)

  let invoiceRowsSynced = 0
  let invoiceRowsSyncError: string | undefined
  const rowSync = await syncMultipartInvoiceRows(
    supabase,
    user.id,
    invoiceId,
    mappedLines,
    invoiceNumber,
    invoiceDate
  )
  if (rowSync.error) {
    invoiceRowsSyncError = rowSync.error
    console.warn('[invoices/upload] invoice_rows sync:', rowSync.error)
  } else {
    invoiceRowsSynced = rowSync.rowCount
  }

  const unmappedCount = mappedLines.filter((l) => !l.mapped).length
  const mappedCount = mappedLines.length - unmappedCount
  const unmappedSpend = mappedLines
    .filter((l) => !l.mapped)
    .reduce((sum, l) => sum + l.charge_amount, 0)
  const shipmentsWithTracking = new Set(
    mappedLines
      .map((l) => (l.reference_1 ?? '').trim())
      .filter(Boolean)
  ).size
  const trackingCoveragePct =
    mappedLines.length > 0 ? (shipmentsWithTracking / mappedLines.length) * 100 : 0

  await Promise.all([
    invalidateParseIngestCacheForUser(user.id),
    invalidateAnalysisCache(user.id),
  ])

  void retainRawInvoiceFile(supabase, {
    userId: user.id,
    filename,
    carrier,
    buffer,
    mimeType: file.type || null,
    sourceInvoiceId: invoiceId,
  })

  return NextResponse.json({
    invoiceId,
    carrier,
    filename,
    totalLines: mappedLines.length,
    mappedLines: mappedCount,
    unmappedLines: unmappedCount,
    totalAmount,
    parseVersion: carrier === 'FedEx' ? FEDEX_PARSE_VERSION : undefined,
    ingestQuality: {
      mappedPct: mappedLines.length > 0 ? (mappedCount / mappedLines.length) * 100 : 100,
      unmappedSpend: +unmappedSpend.toFixed(2),
      trackingCoveragePct: +trackingCoveragePct.toFixed(1),
      invoiceRowsSynced,
      ...(invoiceRowsSyncError ? { invoiceRowsSyncError } : {}),
    },
  })
}
