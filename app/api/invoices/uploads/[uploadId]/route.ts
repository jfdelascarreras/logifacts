import { NextResponse } from 'next/server'

import { invalidateAnalysisCache } from '@/lib/cache/analysis-cache'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
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

  const { data: upload, error: uploadError } = await supabase
    .from('invoice_uploads')
    .select('id, original_file_name')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  const { error: analysisDeleteError } = await supabase
    .from('invoice_upload_analyses')
    .delete()
    .eq('invoice_upload_id', uploadId)
    .eq('user_id', user.id)

  if (analysisDeleteError) {
    return NextResponse.json({ error: analysisDeleteError.message }, { status: 400 })
  }

  const { error: uploadDeleteError } = await supabase
    .from('invoice_uploads')
    .delete()
    .eq('id', uploadId)
    .eq('user_id', user.id)

  if (uploadDeleteError) {
    return NextResponse.json({ error: uploadDeleteError.message }, { status: 400 })
  }

  await invalidateAnalysisCache(user.id)

  const { count: remainingUploads, error: countError } = await supabase
    .from('invoice_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 })
  }

  const remaining = remainingUploads ?? 0

  if (remaining === 0) {
    await supabase.from('invoice_upload_analyses').delete().eq('user_id', user.id)
    await supabase.from('invoice_spend_by_date').delete().eq('user_id', user.id)
  }

  return NextResponse.json({
    deletedUploadId: uploadId,
    deletedFileName: upload.original_file_name,
    remainingUploads: remaining,
    cleared: remaining === 0,
  })
}
