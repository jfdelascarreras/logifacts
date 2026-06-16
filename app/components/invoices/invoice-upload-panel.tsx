'use client'

/**
 * Multi-carrier invoice upload panel — used on the Premium Analysis page.
 *
 * Two-step flow:
 *   1. User selects files (drag-drop or picker) → files queue as "staged" (not yet uploaded).
 *   2. User reviews the list, then clicks "Upload [n] file(s)".
 *   3. All files upload sequentially; one combined analyze runs at the end (S4 batch).
 *   4. After batch analyze, a "Go to analysis" button navigates to /premium-analysis.
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
  | { state: 'uploaded'; result: UploadResult }
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

async function triggerAnalysis(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/invoices/analyze', { method: 'POST', cache: 'no-store' })
  const json = (await res.json()) as { summary?: unknown; error?: string; analysisCacheWarning?: string }
  if (!res.ok) {
    return { ok: false, error: json.error || 'Combined analysis failed after upload.' }
  }
  if (json.summary) dispatchPremiumUpdate(json.summary)
  if (json.analysisCacheWarning) {
    console.warn('[upload] analysis cache:', json.analysisCacheWarning)
  }
  return { ok: true }
}

// ── Main component ────────────────────────────────────────────────────────────

export function InvoiceUploadPanel() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [batchAnalyzing, setBatchAnalyzing] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const processingRef = useRef(false)

  const stagedCount = queue.filter((q) => q.status.state === 'staged').length
  const hasAnyActive = queue.some((q) => q.status.state === 'uploading') || batchAnalyzing

  function updateItem(id: string, status: FileStatus) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)))
  }

  function markUploadedAsDone() {
    setQueue((prev) =>
      prev.map((q) =>
        q.status.state === 'uploaded'
          ? { ...q, status: { state: 'done', result: q.status.result } }
          : q
      )
    )
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

  async function uploadOne(item: QueuedFile): Promise<boolean> {
    updateItem(item.id, { state: 'uploading' })
    try {
      const form = new FormData()
      form.append('file', item.file)
      const res = await fetch('/api/invoices/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      updateItem(item.id, { state: 'uploaded', result: json as UploadResult })
      return true
    } catch (err) {
      updateItem(item.id, {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  async function handleUpload() {
    if (processingRef.current) return
    processingRef.current = true
    setRunning(true)
    setAllDone(false)

    const toProcess = queue.filter((q) => q.status.state === 'staged')
    let uploadedCount = 0
    for (const item of toProcess) {
      const ok = await uploadOne(item)
      if (ok) uploadedCount += 1
    }

    if (uploadedCount > 0) {
      setBatchAnalyzing(true)
      const analyzed = await triggerAnalysis()
      setBatchAnalyzing(false)
      if (!analyzed.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.status.state === 'uploaded'
              ? {
                  ...q,
                  status: {
                    state: 'error',
                    message: `${analyzed.error} Files were saved — use Refresh analysis on the dashboard.`,
                  },
                }
              : q
          )
        )
      } else {
        markUploadedAsDone()
      }
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
        </CardContent>
      </Card>

      {/* Staged + in-progress + done file list */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item) => (
            <FileRow key={item.id} item={item} onRemove={removeStaged} disabled={running} />
          ))}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {stagedCount > 0 && !allDone && (
              <Button onClick={() => void handleUpload()} disabled={running || hasAnyActive}>
                {running
                  ? batchAnalyzing
                    ? 'Analyzing combined dataset…'
                    : 'Uploading…'
                  : `Upload ${stagedCount} file${stagedCount !== 1 ? 's' : ''}`}
              </Button>
            )}

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
  disabled,
}: {
  item: QueuedFile
  onRemove: (id: string) => void
  disabled: boolean
}) {
  const { id, file, status } = item
  const result =
    status.state === 'done' || status.state === 'uploaded' ? status.result : null

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 w-5 flex justify-center">
            {status.state === 'staged' && (
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
            )}
            {(status.state === 'uploading' || (status.state === 'uploaded' && disabled)) && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {status.state === 'uploaded' && !disabled && (
              <span className="text-muted-foreground text-base leading-none">○</span>
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
            {status.state === 'uploaded' && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {disabled ? 'Included in combined analysis…' : 'Uploaded — waiting for batch analysis'}
              </p>
            )}
            {status.state === 'error' && (
              <p className="text-xs text-destructive mt-0.5">{status.message}</p>
            )}
            {result && (status.state === 'done' || status.state === 'uploaded') && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-muted-foreground">Carrier </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {result.carrier}
                  </Badge>
                </span>
                <span>
                  <span className="text-muted-foreground">Lines </span>
                  <span className="font-semibold">{result.totalLines.toLocaleString()}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Mapped </span>
                  <span className="font-semibold text-green-600">
                    {result.mappedLines.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Amount </span>
                  <span className="font-semibold">
                    ${result.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </span>
                {status.state === 'done' ? (
                  <span className="text-muted-foreground">Included in combined Premium Analysis ↑</span>
                ) : null}
              </div>
            )}
          </div>

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
