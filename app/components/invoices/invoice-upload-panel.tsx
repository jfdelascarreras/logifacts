'use client'

/**
 * Multi-carrier invoice upload panel — used on the Premium Analysis page.
 *
 * Two-step flow:
 *   1. User selects files (drag-drop or picker) → files queue as "staged" (not yet uploaded).
 *   2. User reviews the list, then clicks "Upload [n] file(s)".
 *   3. After all uploads complete, a "Go to analysis" button navigates to /premium-analysis.
 *
 * After each successful upload:
 *   - Calls POST /api/invoices/analyze to recompute the Premium Analysis summary.
 *   - Dispatches PREMIUM_ANALYSIS_UPDATED so <PremiumDashboard> auto-refreshes.
 */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// ── Types ────────────────────────────────────────────────────────────────────

interface UploadResult {
  invoiceId: string
  carrier: string
  filename: string
  totalLines: number
  mappedLines: number
  unmappedLines: number
  totalAmount: number
}

type FileStatus =
  | { state: 'staged' }
  | { state: 'uploading' }
  | { state: 'analyzing' }
  | { state: 'done'; result: UploadResult }
  | { state: 'error'; message: string }

interface QueuedFile {
  id: string
  file: File
  status: FileStatus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
const nextId = () => `iup-${++_id}`

function dispatchPremiumUpdate(summary: unknown) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PREMIUM_ANALYSIS_UPDATED, { detail: { summary } }))
}

async function triggerAnalysis(): Promise<void> {
  try {
    const res = await fetch('/api/invoices/analyze', { method: 'POST', cache: 'no-store' })
    const json = (await res.json()) as { summary?: unknown }
    if (res.ok && json.summary) dispatchPremiumUpdate(json.summary)
  } catch {
    // non-fatal — dashboard "Refresh analysis" button is the fallback
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function InvoiceUploadPanel() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const processingRef = useRef(false)

  const stagedCount = queue.filter((q) => q.status.state === 'staged').length
  const hasAnyActive = queue.some(
    (q) => q.status.state === 'uploading' || q.status.state === 'analyzing'
  )

  function updateItem(id: string, status: FileStatus) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)))
  }

  const stage = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    if (!arr.length) return
    setAllDone(false)
    const newItems: QueuedFile[] = arr.map((file) => ({
      id: nextId(),
      file,
      status: { state: 'staged' },
    }))
    setQueue((prev) => [...prev, ...newItems])
  }, [])

  async function uploadOne(item: QueuedFile) {
    updateItem(item.id, { state: 'uploading' })
    try {
      const form = new FormData()
      form.append('file', item.file)
      const res = await fetch('/api/invoices/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      updateItem(item.id, { state: 'analyzing' })
      await triggerAnalysis()
      updateItem(item.id, { state: 'done', result: json as UploadResult })
    } catch (err) {
      updateItem(item.id, {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleUpload() {
    if (processingRef.current) return
    processingRef.current = true
    setRunning(true)
    setAllDone(false)

    // Only process items that are currently staged
    const toProcess = queue.filter((q) => q.status.state === 'staged')
    for (const item of toProcess) {
      await uploadOne(item)
    }

    processingRef.current = false
    setRunning(false)
    setAllDone(true)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) stage(e.dataTransfer.files)
  }, [stage])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) stage(e.target.files)
    e.target.value = ''
  }

  function removeStaged(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id))
  }

  function reset() {
    setQueue([])
    setAllDone(false)
  }

  return (
    <div className="space-y-4">
      {/* Carrier format guide */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {CARRIER_CHIPS.map(({ carrier, format, hint, color }) => (
          <div key={carrier} className={`rounded-lg border px-3 py-2 ${color}`}>
            <p className="font-semibold">{carrier}</p>
            <p className="font-mono text-[11px] mt-0.5">{format}</p>
            <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <label
            htmlFor="iup-file-input"
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <svg
              className="w-10 h-10 text-muted-foreground mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            <span className="text-sm font-medium text-foreground">
              Drop files here or click to browse
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Multiple files supported · CSV (UPS) · XLS/XLSX (FedEx, WWE)
            </span>
            <input
              id="iup-file-input"
              type="file"
              accept=".csv,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={onFileChange}
              disabled={running}
            />
          </label>

          {/* UPS tip */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold">UPS tip:</span> Use{' '}
            <span className="font-mono">&quot;Download CSV (250 Columns)&quot;</span> from UPS
            Billing Center → My Plan Invoices → three-dot menu. Carrier is auto-detected.
          </div>
        </CardContent>
      </Card>

      {/* Staged + in-progress + done file list */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item) => (
            <FileRow
              key={item.id}
              item={item}
              onRemove={removeStaged}
              onView={(id) => router.push(`/dashboard/${id}`)}
              disabled={running}
            />
          ))}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* Upload button — only while there are staged files */}
            {stagedCount > 0 && !allDone && (
              <Button onClick={() => void handleUpload()} disabled={running || hasAnyActive}>
                {running
                  ? 'Uploading…'
                  : `Upload ${stagedCount} file${stagedCount !== 1 ? 's' : ''}`}
              </Button>
            )}

            {/* Go to analysis — shown once every file is settled */}
            {allDone && stagedCount === 0 && (
              <Button onClick={() => router.push('/premium-analysis')}>
                Go to analysis ↓
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={running || hasAnyActive}
            >
              Clear all
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({
  item,
  onRemove,
  onView,
  disabled,
}: {
  item: QueuedFile
  onRemove: (id: string) => void
  onView: (invoiceId: string) => void
  disabled: boolean
}) {
  const { id, file, status } = item

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className="mt-0.5 flex-shrink-0 w-5 flex justify-center">
            {status.state === 'staged' && (
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
            )}
            {(status.state === 'uploading' || status.state === 'analyzing') && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {status.state === 'done' && (
              <span className="text-green-600 text-base leading-none">✓</span>
            )}
            {status.state === 'error' && (
              <span className="text-destructive text-base leading-none">✕</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>

            {status.state === 'staged' && (
              <p className="text-xs text-muted-foreground mt-0.5">Ready to upload</p>
            )}
            {status.state === 'uploading' && (
              <p className="text-xs text-muted-foreground mt-0.5">Parsing and mapping charge lines…</p>
            )}
            {status.state === 'analyzing' && (
              <p className="text-xs text-muted-foreground mt-0.5">Updating analysis…</p>
            )}
            {status.state === 'error' && (
              <p className="text-xs text-destructive mt-0.5">{status.message}</p>
            )}
            {status.state === 'done' && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Carrier </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {status.result.carrier}
                    </Badge>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Lines </span>
                    <span className="font-semibold">{status.result.totalLines.toLocaleString()}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Mapped </span>
                    <span className="font-semibold text-green-600">
                      {status.result.mappedLines.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Amount </span>
                    <span className="font-semibold">
                      ${status.result.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
                <Button size="sm" onClick={() => onView(status.result.invoiceId)}>
                  View Analysis
                </Button>
              </div>
            )}
          </div>

          {/* Remove button — only for staged files */}
          {status.state === 'staged' && (
            <button
              type="button"
              onClick={() => onRemove(id)}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              className="mt-0.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARRIER_CHIPS = [
  {
    carrier: 'UPS',
    format: 'CSV',
    hint: '250-column export',
    color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200',
  },
  {
    carrier: 'FedEx',
    format: 'XLS / XLSX',
    hint: 'Standard invoice export',
    color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200',
  },
  {
    carrier: 'WWE',
    format: 'XLS / XLSX',
    hint: 'World Wide Express',
    color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-200',
  },
] as const
