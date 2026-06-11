import { createClient } from '@/lib/supabase/server'
import type { SpendShipmentPeriodMatrix } from '@/lib/invoices/period-averages-matrix'
import { generatePeriodMatrixExcel } from '@/lib/invoices/period-matrix-exporter'

export const maxDuration = 60

function isPeriodMatrix(raw: unknown): raw is SpendShipmentPeriodMatrix {
  if (!raw || typeof raw !== 'object') return false
  const m = raw as SpendShipmentPeriodMatrix
  return Array.isArray(m.years) && Array.isArray(m.byYear) && Array.isArray(m.byYearMonth)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { periodMatrix?: unknown }
  try {
    body = (await request.json()) as { periodMatrix?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isPeriodMatrix(body.periodMatrix) || body.periodMatrix.years.length === 0) {
    return Response.json({ error: 'periodMatrix is required' }, { status: 400 })
  }

  const buffer = await generatePeriodMatrixExcel(body.periodMatrix)
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const filename = `avg-spend-shipments_${stamp}.xlsx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
