'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { parseInvoiceCsvText } from '@/lib/invoices/csv'
import { normalizeCsvForDedupe, sha256HexUtf8 } from '@/lib/invoices/dedupe-hash'
import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const UPLOADS_PREVIEW_COUNT = 5

/** Strips RFC 5987 charset prefix (e.g., "UTF-8'", "UTF-8''", "UTF-8'en'") from filenames
 *  that Windows saves when downloading files with encoded Content-Disposition headers. */
function cleanFilename(name: string): string {
  return name.replace(/^(UTF-8|ISO-8859-\d+)'[a-z]*'?/i, '') || name
}

type StoredUpload = {
  id: string
  original_file_name: string
  created_at: string
  row_count: number | null
  status: string
}

export function InvoiceCsvUpload() {
  const supabase = useMemo(() => createClient(), [])

  const [files, setFiles] = useState<File[]>([])
  /** `uploading` = saving files; `analyzing` = POST /api/invoices/analyze after save */
  const [workPhase, setWorkPhase] = useState<'idle' | 'uploading' | 'analyzing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [storedUploads, setStoredUploads] = useState<StoredUpload[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<StoredUpload | null>(null)
  const [showAllUploads, setShowAllUploads] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refreshStoredUploads = useCallback(async () => {
    const { data, error: listError } = await supabase
      .from('invoice_uploads')
      .select('id, original_file_name, created_at, row_count, status')
      .order('created_at', { ascending: false })
      .limit(200)

    if (listError) throw listError
    setStoredUploads(data ?? [])
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingUploads(true)
      try {
        await refreshStoredUploads()
        if (!cancelled) setError(null)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load your uploads.')
        }
      } finally {
        if (!cancelled) setLoadingUploads(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStoredUploads])

  function dispatchPremiumAnalysisUpdate(detail: {
    summary?: unknown
    uploadId?: string
    uploadsAnalyzed?: number
    cleared?: boolean
  }) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(PREMIUM_ANALYSIS_UPDATED, { detail }))
  }

  async function rerunAnalysisAfterUploadChange() {
    const res = await fetch('/api/invoices/analyze', { method: 'POST' })
    const json = (await res.json()) as {
      error?: string
      summary?: unknown
      uploadId?: string
      uploadsAnalyzed?: number
    }
    if (!res.ok) {
      throw new Error(json.error || 'Analysis failed.')
    }
    dispatchPremiumAnalysisUpdate({
      summary: json.summary,
      uploadId: json.uploadId,
      uploadsAnalyzed: json.uploadsAnalyzed,
    })
  }

  async function handleDeleteUpload() {
    if (!deleteTarget) return

    setDeletingId(deleteTarget.id)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/invoices/uploads/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as {
        error?: string
        deletedFileName?: string
        remainingUploads?: number
        cleared?: boolean
      }

      if (!res.ok) {
        throw new Error(json.error || 'Delete failed.')
      }

      await refreshStoredUploads()
      setDeleteTarget(null)

      if (json.cleared) {
        dispatchPremiumAnalysisUpdate({ cleared: true })
        setSuccess(
          `Removed "${json.deletedFileName ?? deleteTarget.original_file_name}". No invoice files remain — upload new CSVs to run analysis again.`
        )
        return
      }

      setWorkPhase('analyzing')
      try {
        await rerunAnalysisAfterUploadChange()
        setSuccess(
          `Removed "${json.deletedFileName ?? deleteTarget.original_file_name}". Analysis updated with your remaining ${json.remainingUploads ?? ''} file(s).`
        )
      } catch (analyzeErr: unknown) {
        const msg = analyzeErr instanceof Error ? analyzeErr.message : 'Analysis failed.'
        setError(
          `File removed, but analysis did not finish: ${msg} Use Refresh analysis below to recompute.`
        )
      } finally {
        setWorkPhase('idle')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
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

      // Primary dedup: by content SHA-256 (catches same bytes under any file name).
      const existingHashes = new Set(
        (existingUploads ?? [])
          .map((r) => r.content_sha256)
          .filter((h): h is string => typeof h === 'string' && h.length > 0)
      )
      // Fallback dedup: by file name, but only for uploads that have no hash yet
      // (uploaded before the sha256 column was added, or before Refresh Analysis was run).
      // This prevents re-uploading those files until their hash is backfilled by the
      // analysis engine on the next Refresh Analysis run.
      const existingNamesWithoutHash = new Set(
        (existingUploads ?? [])
          .filter((r) => !r.content_sha256 || String(r.content_sha256).length === 0)
          .map((r) => r.original_file_name)
      )

      const seenHashesInBatch = new Set<string>()
      const seenNamesInBatch = new Set<string>()

      const insertedRows: Array<{
        user_id: string
        original_file_name: string
        csv_text: string
        row_count: number
        status: string
        content_sha256: string
      }> = []

      let skippedDuplicateContent = 0
      let skippedOversized = 0
      let skippedEmpty = 0

      for (const file of files) {
        if (file.size > maxBytes) {
          skippedOversized += 1
          continue
        }

        const csvText = await file.text()
        const dedupeKey = normalizeCsvForDedupe(csvText)
        const contentSha256 = await sha256HexUtf8(dedupeKey)

        // Skip if we've already seen this exact content (in DB or in this batch).
        if (existingHashes.has(contentSha256) || seenHashesInBatch.has(contentSha256)) {
          skippedDuplicateContent += 1
          continue
        }
        // Fallback: skip if same name as an un-hashed existing upload or selected twice.
        if (existingNamesWithoutHash.has(file.name) || seenNamesInBatch.has(file.name)) {
          skippedDuplicateContent += 1
          continue
        }

        const mappedRecords = parseInvoiceCsvText(csvText)
        if (!mappedRecords.length) {
          skippedEmpty += 1
          continue
        }

        insertedRows.push({
          user_id: user.id,
          original_file_name: cleanFilename(file.name),
          csv_text: csvText.replace(/^\uFEFF/, ''),
          row_count: mappedRecords.length,
          status: 'uploaded',
          content_sha256: contentSha256,
        })
        seenHashesInBatch.add(contentSha256)
        seenNamesInBatch.add(file.name)
      }

      if (!insertedRows.length) {
        const parts: string[] = []
        if (skippedDuplicateContent > 0) {
          parts.push(`${skippedDuplicateContent} identical to files already on your account`)
        }
        if (skippedOversized > 0) parts.push(`${skippedOversized} over 5 MB`)
        if (skippedEmpty > 0) parts.push(`${skippedEmpty} empty or unreadable`)
        const allDuplicates = skippedOversized === 0 && skippedEmpty === 0
        setFiles([])
        setWorkPhase('idle')
        if (allDuplicates) {
          setSuccess(
            `All ${files.length} selected file(s) are already in your account — no new file content to upload. ` +
            `Use Refresh analysis below to recompute with your existing files.`
          )
        } else {
          setError(
            parts.length > 0
              ? `Nothing uploaded: ${parts.join('; ')}.`
              : 'No files to upload. Choose CSV files and try again.'
          )
        }
        return
      }

      let insertedCount = 0
      for (let i = 0; i < insertedRows.length; i += INSERT_CHUNK_SIZE) {
        const chunk = insertedRows.slice(i, i + INSERT_CHUNK_SIZE)
        const { error: insertErr } = await supabase.from('invoice_uploads').insert(chunk)
        if (insertErr) {
          const detail = describePostgrestLikeError(insertErr) || 'Database insert failed.'
          throw new Error(
            insertedCount > 0
              ? `Saved ${insertedCount} of ${insertedRows.length} file(s), then an error occurred: ${detail} If some files were saved, check your uploaded files list or try again with the remaining files.`
              : detail
          )
        }
        insertedCount += chunk.length
      }

      const skippedTotal = skippedDuplicateContent + skippedOversized + skippedEmpty
      const uploadNote =
        `Uploaded ${insertedRows.length} file(s)${
          skippedTotal
            ? `, skipped ${skippedTotal} (${[
                skippedDuplicateContent && `${skippedDuplicateContent} identical content`,
                skippedOversized && `${skippedOversized} too large`,
                skippedEmpty && `${skippedEmpty} empty/unreadable`,
              ]
                .filter(Boolean)
                .join(', ')})`
            : ''
        }.`

      setFiles([])
      await refreshStoredUploads()

      setWorkPhase('analyzing')
      setError(null)
      try {
        await rerunAnalysisAfterUploadChange()
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
                  Selected {files.length} file(s). Files with identical content to existing uploads are skipped.
                  Overlapping invoice rows across files are deduplicated automatically during analysis.
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
                disabled={workPhase !== 'idle' || loadingUploads}
                onClick={() => {
                  setLoadingUploads(true)
                  refreshStoredUploads()
                    .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load uploads.'))
                    .finally(() => setLoadingUploads(false))
                }}
              >
                Refresh list
              </Button>
            </div>

            <div className="pt-2">
              <div className="font-heading text-sm font-semibold tracking-wide text-accent">Your uploaded files</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Remove a file to exclude it from Premium Analysis. Deleting the last file clears your dashboard metrics.
              </p>
              {loadingUploads ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading uploads…
                </p>
              ) : storedUploads.length ? (
                <div className="mt-2 grid gap-3">
                  {(showAllUploads ? storedUploads : storedUploads.slice(0, UPLOADS_PREVIEW_COUNT)).map((u) => {
                    const isDeleting = deletingId === u.id
                    const displayName = cleanFilename(u.original_file_name)
                    return (
                      <div
                        key={u.id}
                        className="rounded-lg border border-accent/20 bg-background p-3 transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Uploaded: {new Date(u.created_at).toLocaleString()}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Rows: {u.row_count ?? '—'} · Status: {u.status}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                            disabled={workPhase !== 'idle' || isDeleting}
                            onClick={() => setDeleteTarget(u)}
                            aria-label={`Delete ${displayName}`}
                          >
                            {isDeleting ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="size-4" aria-hidden />
                            )}
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {storedUploads.length > UPLOADS_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllUploads(v => !v)}
                      className="flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      {showAllUploads ? (
                        <><ChevronUp className="size-4" aria-hidden /> Show less</>
                      ) : (
                        <><ChevronDown className="size-4" aria-hidden /> See all {storedUploads.length} files</>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No files uploaded yet.</p>
              )}
            </div>

            <Dialog
              open={!!deleteTarget}
              onOpenChange={(open) => {
                if (!open && !deletingId) setDeleteTarget(null)
              }}
            >
              <DialogContent showCloseButton={!deletingId}>
                <DialogHeader>
                  <DialogTitle>Delete uploaded file?</DialogTitle>
                  <DialogDescription>
                    {deleteTarget ? (
                      <>
                        <span className="font-medium text-foreground">{deleteTarget.original_file_name}</span> will be
                        removed from your account. Premium Analysis will recompute using your remaining files, or clear
                        if this was your last upload.
                      </>
                    ) : null}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!!deletingId}
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!!deletingId}
                    onClick={() => void handleDeleteUpload()}
                  >
                    {deletingId ? 'Deleting…' : 'Delete file'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

