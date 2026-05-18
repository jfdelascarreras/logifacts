import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectCarrier, parseInvoice } from '@/lib/invoices/parsers'
import { mapInvoiceLines } from '@/lib/invoices/mapping'
import { redis } from '@/lib/cache/redis'

export const maxDuration = 120

function filterHash(filters: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(filters, Object.keys(filters).sort())).toString('base64url')
}

function warmCacheKey(userId: string, invoiceId: string): string {
  return `invoice_analysis:${userId}:${invoiceId}:${filterHash({})}`
}

/**
 * Recursively strip null bytes and non-printable control characters from every
 * string value in an object before it reaches Postgres.
 * Postgres rejects \u0000 in text columns unconditionally.
 */
function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string') {
      // eslint-disable-next-line no-control-regex
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

  // 1. Detect file format from magic bytes (not just extension)
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
  const isXls  = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0
  const isExcel = isXlsx || isXls

  // 2. Detect carrier
  const carrier = detectCarrier(filename)

  // UPS invoices must be CSV (250 columns). Reject Excel files early with a helpful message.
  if (carrier === 'UPS' && isExcel) {
    return NextResponse.json(
      {
        error:
          'UPS invoices must be uploaded as CSV, not Excel. ' +
          'In the UPS Billing Center, open My Plan Invoices, click the three-dot menu on the invoice row, ' +
          'and choose "Download CSV (250 Columns)".',
      },
      { status: 422 }
    )
  }

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

  // 8. Pre-warm Redis cache with base (no-filter) result
  if (redis) {
    try {
      const cacheKey = warmCacheKey(user.id, invoiceId)
      await redis.set(cacheKey, mappedLines, { ex: 3600 })
    } catch {
      // non-fatal
    }
  }

  const unmappedCount = mappedLines.filter((l) => !l.mapped).length

  return NextResponse.json({
    invoiceId,
    carrier,
    filename,
    totalLines: mappedLines.length,
    mappedLines: mappedLines.length - unmappedCount,
    unmappedLines: unmappedCount,
    totalAmount,
  })
}
