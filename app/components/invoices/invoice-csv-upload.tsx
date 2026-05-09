'use client'

import { useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { parseInvoiceCsvText } from '@/lib/invoices/csv'
import { normalizeCsvForDedupe, sha256HexUtf8 } from '@/lib/invoices/dedupe-hash'
import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Supabase PostgREST errors are plain objects, not always `instanceof Error`. */
function describePostgrestLikeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'object' && e !== null) {
    const o = e as { message?: string; details?: string; hint?: string }
    const parts = [o.message, o.details, o.hint].map((s) => (s ? String(s).trim() : '')).filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return ''
}

/** Keeps each request under typical gateway / PostgREST body limits when many CSVs are selected. */
const INSERT_CHUNK_SIZE = 5

export function InvoiceCsvUpload() {
  const supabase = useMemo(() => createClient(), [])

  const [files, setFiles] = useState<File[]>([])
  /** `uploading` = saving files; `analyzing` = POST /api/invoices/analyze after save */
  const [workPhase, setWorkPhase] = useState<'idle' | 'uploading' | 'analyzing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [recentUploads, setRecentUploads] = useState<
    Array<{ id: string; original_file_name: string; created_at: string; row_count: number | null; status: string }>
  >([])

  async function refreshRecent() {
    const { data, error } = await supabase
      .from('invoice_uploads')
      .select('id, original_file_name, created_at, row_count, status')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error
    setRecentUploads(data ?? [])
  }

  async function handleUpload() {
    if (!files.length) {
      setError('Please choose one or more CSV files.')
      return
    }

    setError(null)
    setSuccess(null)

    const maxBytes = 5 * 1024 * 1024 // 5MB

    setWorkPhase('uploading')
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (userErr || !user) throw new Error('Not authenticated.')

      const { data: existingUploads, error: existingError } = await supabase
        .from('invoice_uploads')
        .select('original_file_name, content_sha256')
        .eq('user_id', user.id)

      if (existingError) throw existingError

      const existingNames = new Set((existingUploads ?? []).map((r) => r.original_file_name))
      const existingHashes = new Set(
        (existingUploads ?? [])
          .map((r) => r.content_sha256)
          .filter((h): h is string => typeof h === 'string' && h.length > 0)
      )

      const seenNamesInBatch = new Set<string>()
      const seenHashesInBatch = new Set<string>()

      const insertedRows: Array<{
        user_id: string
        original_file_name: string
        csv_text: string
        row_count: number
        status: string
        content_sha256: string
      }> = []

      let skippedDuplicateName = 0
      let skippedDuplicateContent = 0
      let skippedOversized = 0
      let skippedEmpty = 0
      for (const file of files) {
        if (existingNames.has(file.name) || seenNamesInBatch.has(file.name)) {
          skippedDuplicateName += 1
          continue
        }

        if (file.size > maxBytes) {
          skippedOversized += 1
          continue
        }

        const csvText = await file.text()
        const dedupeKey = normalizeCsvForDedupe(csvText)
        const contentSha256 = await sha256HexUtf8(dedupeKey)

        if (existingHashes.has(contentSha256) || seenHashesInBatch.has(contentSha256)) {
          skippedDuplicateContent += 1
          continue
        }

        // Apply UPS invoice header mapping by parsing each row using INVOICE_HEADERS.
        // We store raw csv_text but row_count is based on mapped records.
        const mappedRecords = parseInvoiceCsvText(csvText)
        if (!mappedRecords.length) {
          skippedEmpty += 1
          continue
        }

        insertedRows.push({
          user_id: user.id,
          original_file_name: file.name,
          csv_text: csvText.replace(/^\uFEFF/, ''),
          row_count: mappedRecords.length,
          status: 'uploaded',
          content_sha256: contentSha256,
        })
        seenNamesInBatch.add(file.name)
        seenHashesInBatch.add(contentSha256)
      }

      if (!insertedRows.length) {
        const parts: string[] = []
        if (skippedDuplicateName > 0) {
          parts.push(
            `${skippedDuplicateName} file(s) skipped — same file name as an upload already on your account (or selected twice). Rename the file or remove the existing upload if you meant to replace it.`
          )
        }
        if (skippedDuplicateContent > 0) {
          parts.push(
            `${skippedDuplicateContent} file(s) skipped — identical invoice data already uploaded (same CSV content, even if the file name differs).`
          )
        }
        if (skippedOversized > 0) {
          parts.push(`${skippedOversized} file(s) over 5MB`)
        }
        if (skippedEmpty > 0) {
          parts.push(
            `${skippedEmpty} file(s) had no data rows after parsing (empty file, wrong format, or not comma-separated CSV)`
          )
        }
        throw new Error(
          parts.length > 0
            ? parts.join(' ')
            : 'No files to upload. Choose CSV files and try again.'
        )
      }

      let insertedCount = 0
      for (let i = 0; i < insertedRows.length; i += INSERT_CHUNK_SIZE) {
        const chunk = insertedRows.slice(i, i + INSERT_CHUNK_SIZE)
        const { error: insertErr } = await supabase.from('invoice_uploads').insert(chunk)
        if (insertErr) {
          const detail = describePostgrestLikeError(insertErr) || 'Database insert failed.'
          throw new Error(
            insertedCount > 0
              ? `Saved ${insertedCount} of ${insertedRows.length} file(s), then an error occurred: ${detail} If some files were saved, check Recent uploads or try again with the remaining files.`
              : detail
          )
        }
        insertedCount += chunk.length
      }

      const skippedTotal =
        skippedDuplicateName + skippedDuplicateContent + skippedOversized + skippedEmpty
      const uploadNote =
        `Uploaded ${insertedRows.length} file(s)${
          skippedTotal
            ? `, skipped ${skippedTotal} (${[
                skippedDuplicateName && `${skippedDuplicateName} duplicate name`,
                skippedDuplicateContent && `${skippedDuplicateContent} duplicate content`,
                skippedOversized && `${skippedOversized} too large`,
                skippedEmpty && `${skippedEmpty} empty/unreadable`,
              ]
                .filter(Boolean)
                .join(', ')})`
            : ''
        }.`

      setFiles([])
      await refreshRecent()

      setWorkPhase('analyzing')
      setError(null)
      try {
        const res = await fetch('/api/invoices/analyze', { method: 'POST' })
        const json = (await res.json()) as { error?: string; summary?: unknown; uploadId?: string; uploadsAnalyzed?: number }
        if (!res.ok) {
          throw new Error(json.error || 'Analysis failed.')
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(PREMIUM_ANALYSIS_UPDATED, {
              detail: { summary: json.summary, uploadId: json.uploadId, uploadsAnalyzed: json.uploadsAnalyzed },
            })
          )
        }
        setSuccess(`${uploadNote} Analysis complete — your dashboard below is updated.`)
      } catch (analyzeErr: unknown) {
        const msg = analyzeErr instanceof Error ? analyzeErr.message : 'Analysis failed.'
        setSuccess(null)
        setError(
          `${uploadNote} Automatic analysis did not finish: ${msg} Your files are saved — use Refresh analysis below to recompute.`
        )
      } finally {
        setWorkPhase('idle')
      }
    } catch (e: unknown) {
      const fromErr = e instanceof Error ? e.message : ''
      const fromObj = describePostgrestLikeError(e)
      setError(fromErr || fromObj || 'Upload failed.')
      setWorkPhase('idle')
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-accent/25 bg-card">
        <CardHeader>
          <CardTitle className="text-accent">Upload invoice CSVs</CardTitle>
          <CardDescription>
            Add UPS-style invoice CSV exports. After each successful upload we analyze your stored files and update the
            metrics below automatically. Use <strong className="font-medium text-foreground">Refresh analysis</strong>{' '}
            only when you want to recompute manually (for example after mapping changes or if automatic analysis failed).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="grid gap-2">
              <Label htmlFor="invoice-csv">CSV file</Label>
              <Input
                id="invoice-csv"
                type="file"
                multiple
                accept=".csv,text/csv"
                aria-describedby="invoice-csv-help"
                aria-invalid={!!error}
                className="h-11 cursor-pointer rounded-xl border-2 border-accent/45 bg-background file:mr-3 file:rounded-lg file:bg-accent file:px-3 file:text-accent-foreground hover:border-accent/70 focus-visible:ring-accent/35"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []))
                  setSuccess(null)
                  setError(null)
                }}
              />
              {files.length ? (
                <p id="invoice-csv-help" className="text-sm text-muted-foreground">
                  Selected {files.length} file(s). UPS header mapping will be applied to each. Duplicate file names
                  (or identical file contents) are skipped automatically. Many files upload in small batches.
                </p>
              ) : (
                <p id="invoice-csv-help" className="text-sm text-muted-foreground">
                  Choose one or more CSV files (max 5MB each). UPS header mapping is applied automatically.
                </p>
              )}
            </div>

            <div aria-live="polite" aria-atomic="true" className="min-h-5">
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p role="status" className="text-sm text-secondary-foreground">
                  {success}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button onClick={handleUpload} disabled={!files.length || workPhase !== 'idle'}>
                {workPhase === 'analyzing'
                  ? 'Analyzing…'
                  : workPhase === 'uploading'
                    ? 'Uploading…'
                    : 'Upload CSV'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-accent/40 text-accent hover:bg-accent/10"
                disabled={workPhase !== 'idle'}
                onClick={() => {
                  refreshRecent().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load uploads.'))
                }}
              >
                Refresh
              </Button>
            </div>

            {recentUploads.length ? (
              <div className="pt-2">
                <div className="font-heading text-sm font-semibold tracking-wide text-accent">Recent uploads</div>
                <div className="mt-2 grid gap-3">
                  {recentUploads.map((u) => (
                    <div
                      key={u.id}
                      className="rounded-lg border border-accent/20 bg-background p-3 transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{u.original_file_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Uploaded: {new Date(u.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Rows: {u.row_count ?? '—'}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">Status: {u.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

