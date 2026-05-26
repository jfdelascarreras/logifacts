'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  | { state: 'pending' }
  | { state: 'uploading' }
  | { state: 'done'; result: UploadResult }
  | { state: 'error'; message: string }

interface QueuedFile {
  file: File
  id: string
  status: FileStatus
}

let idCounter = 0
function nextId() {
  return `f-${++idCounter}`
}

export default function UploadPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const processingRef = useRef(false)

  function updateItem(id: string, status: FileStatus) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)))
  }

  async function uploadOne(item: QueuedFile) {
    updateItem(item.id, { state: 'uploading' })
    try {
      const formData = new FormData()
      formData.append('file', item.file)
      const res = await fetch('/api/invoices/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      updateItem(item.id, { state: 'done', result: json as UploadResult })
    } catch (err) {
      updateItem(item.id, { state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function processQueue(newItems: QueuedFile[]) {
    if (processingRef.current) return
    processingRef.current = true
    // Upload sequentially to avoid hammering the API
    for (const item of newItems) {
      await uploadOne(item)
    }
    processingRef.current = false
  }

  function enqueue(files: FileList | File[]) {
    const arr = Array.from(files)
    if (arr.length === 0) return
    const newItems: QueuedFile[] = arr.map((file) => ({
      file,
      id: nextId(),
      status: { state: 'pending' },
    }))
    setQueue((prev) => [...prev, ...newItems])
    // kick off processing after state flushes
    setTimeout(() => processQueue(newItems), 0)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) enqueue(e.target.files)
    e.target.value = ''
  }

  const hasResults = queue.length > 0

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Upload Invoices</h1>
          <p className="text-sm text-muted-foreground">Select one or more invoice files — carrier is auto-detected</p>
        </div>

        {/* Format guide */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            { carrier: 'UPS', format: 'CSV', hint: '250-column export', color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200' },
            { carrier: 'FedEx', format: 'XLS / XLSX', hint: 'Standard invoice export', color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200' },
            { carrier: 'WWE', format: 'XLS / XLSX', hint: 'World Wide Express', color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-200' },
          ].map(({ carrier, format, hint, color }) => (
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
              htmlFor="file-input"
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <svg className="w-10 h-10 text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <span className="text-sm font-medium text-foreground">Drop files here or click to browse</span>
              <span className="text-xs text-muted-foreground mt-1">Multiple files supported · CSV (UPS) · XLS/XLSX (FedEx, WWE)</span>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xls,.xlsx"
                multiple
                className="hidden"
                onChange={onFileChange}
              />
            </label>

            {/* UPS reminder */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <span className="font-semibold">UPS tip:</span> Use the{' '}
              <span className="font-mono">&quot;Download CSV (250 Columns)&quot;</span> option from UPS Billing Center →
              My Plan Invoices → three-dot menu. The carrier is auto-detected — no renaming needed.
            </div>
          </CardContent>
        </Card>

        {/* Per-file results */}
        {hasResults && (
          <div className="space-y-3">
            {queue.map((item) => (
              <FileCard key={item.id} item={item} onView={(id) => router.push(`/dashboard/${id}`)} />
            ))}

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setQueue([])}>
                Clear all
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FileCard({ item, onView }: { item: QueuedFile; onView: (invoiceId: string) => void }) {
  const { file, status } = item

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className="mt-0.5 flex-shrink-0">
            {status.state === 'pending' && (
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
            )}
            {status.state === 'uploading' && (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {status.state === 'done' && (
              <span className="text-green-600 text-lg leading-none">✓</span>
            )}
            {status.state === 'error' && (
              <span className="text-destructive text-lg leading-none">✕</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>

            {status.state === 'pending' && (
              <p className="text-xs text-muted-foreground mt-0.5">Queued…</p>
            )}

            {status.state === 'uploading' && (
              <p className="text-xs text-muted-foreground mt-0.5">Parsing and mapping charge lines…</p>
            )}

            {status.state === 'error' && (
              <p className="text-xs text-destructive mt-0.5">{status.message}</p>
            )}

            {status.state === 'done' && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Carrier </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status.result.carrier}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lines </span>
                    <span className="font-semibold">{status.result.totalLines.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mapped </span>
                    <span className="font-semibold text-green-600">{status.result.mappedLines.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount </span>
                    <span className="font-semibold">${status.result.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <Button size="sm" onClick={() => onView(status.result.invoiceId)}>
                  View Analysis
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
