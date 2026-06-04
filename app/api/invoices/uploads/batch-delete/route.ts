import { NextResponse } from 'next/server'

import {
  deleteUserInvoiceUpload,
  parseUploadSource,
  type DeleteUploadItemResult,
  type InvoiceUploadSource,
} from '@/lib/invoices/upload-management'
import { createClient } from '@/lib/supabase/server'

type BatchDeleteBody = {
  items?: Array<{ id?: string; source?: string }>
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

  let body: BatchDeleteBody
  try {
    body = (await request.json()) as BatchDeleteBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const items = (body.items ?? [])
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      source: parseUploadSource(item.source),
    }))
    .filter((item) => item.id.length > 0)

  if (!items.length) {
    return NextResponse.json({ error: 'No upload ids provided' }, { status: 400 })
  }

  const results: DeleteUploadItemResult[] = []
  let lastRemaining = 0
  let cleared = false

  for (const item of items) {
    try {
      const result = await deleteUserInvoiceUpload(
        supabase,
        user.id,
        item.id,
        item.source as InvoiceUploadSource
      )
      lastRemaining = result.remainingUploads
      cleared = result.cleared
      results.push({
        id: item.id,
        source: item.source,
        deletedFileName: result.deletedFileName,
        ok: true,
      })
    } catch (err) {
      results.push({
        id: item.id,
        source: item.source,
        deletedFileName: '',
        ok: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      })
    }
  }

  const deletedCount = results.filter((r) => r.ok).length
  const failedCount = results.length - deletedCount

  if (deletedCount === 0) {
    return NextResponse.json(
      {
        error: results[0]?.error ?? 'Delete failed',
        results,
        deletedCount,
        failedCount,
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    results,
    deletedCount,
    failedCount,
    remainingUploads: lastRemaining,
    cleared,
  })
}
