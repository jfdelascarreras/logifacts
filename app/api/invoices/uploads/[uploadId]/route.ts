import { NextResponse } from 'next/server'

import { deleteUserInvoiceUpload, parseUploadSource } from '@/lib/invoices/upload-management'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { uploadId } = await params
  if (!uploadId?.trim()) {
    return NextResponse.json({ error: 'Upload id is required' }, { status: 400 })
  }

  const url = new URL(request.url)
  const source = parseUploadSource(url.searchParams.get('source'))

  try {
    const result = await deleteUserInvoiceUpload(supabase, user.id, uploadId, source)
    return NextResponse.json({
      deletedUploadId: uploadId,
      deletedFileName: result.deletedFileName,
      remainingUploads: result.remainingUploads,
      cleared: result.cleared,
      source,
    })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 400
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status })
  }
}
