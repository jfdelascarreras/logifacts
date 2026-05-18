import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoiceExcel } from '@/lib/invoices/exporter'
import type { InvoiceLine } from '@/types/invoice'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { invoiceId } = await params

  // Verify ownership
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('id, filename, carrier')
    .eq('id', invoiceId)
    .eq('user_id', user.id)
    .single()

  if (invError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const { data: lines, error: linesError } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('shipment_date', { ascending: true })

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  const buffer = await generateInvoiceExcel((lines ?? []) as InvoiceLine[])

  const safeFilename = invoice.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const downloadName = `${safeFilename.replace(/\.[^.]+$/, '')}_analysis.xlsx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
