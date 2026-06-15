import { createHash } from 'crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Carrier } from '@/types/invoice'

/** Retain raw multipart bytes for re-parse (off by default). */
export function rawInvoiceFilesRetainEnabled(): boolean {
  return process.env.RAW_INVOICE_FILES_RETAIN === '1'
}

/** Skip storing payloads larger than 8 MiB in Postgres bytea. */
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024

export function contentSha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export type RetainRawInvoiceFileInput = {
  userId: string
  filename: string
  carrier: Carrier
  buffer: Buffer
  mimeType?: string | null
  sourceInvoiceId: string
}

/**
 * Optional audit retention of uploaded multipart files (FedEx/WWE).
 * UPS CSV text already lives in `invoice_uploads.csv_text`.
 */
export async function retainRawInvoiceFile(
  supabase: SupabaseClient,
  input: RetainRawInvoiceFileInput
): Promise<{ retained: boolean; error?: string }> {
  if (!rawInvoiceFilesRetainEnabled()) return { retained: false }

  const sha = contentSha256Hex(input.buffer)
  const byteSize = input.buffer.byteLength
  const payload = byteSize <= MAX_PAYLOAD_BYTES ? input.buffer : null

  const { error } = await supabase.from('raw_invoice_files').upsert(
    {
      user_id: input.userId,
      filename: input.filename,
      carrier: input.carrier,
      content_sha256: sha,
      byte_size: byteSize,
      mime_type: input.mimeType ?? null,
      file_payload: payload,
      source_invoice_id: input.sourceInvoiceId,
      invoice_upload_id: null,
    },
    { onConflict: 'user_id,content_sha256', ignoreDuplicates: true }
  )

  if (error) {
    console.warn('[raw-invoice-files] retain failed:', error.message)
    return { retained: false, error: error.message }
  }

  return { retained: true }
}
