'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

import { PREMIUM_ANALYSIS_UPDATED } from '@/lib/premium-analysis-events'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InvoiceUploadSource, StoredInvoiceUploadItem } from '@/lib/invoices/upload-management'

type UploadKey = `${InvoiceUploadSource}:${string}`

function uploadKey(item: Pick<StoredInvoiceUploadItem, 'id' | 'source'>): UploadKey {
  return `${item.source}:${item.id}`
}

function formatAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dispatchPremiumAnalysisUpdate(detail: {
  summary?: unknown
  cleared?: boolean
  uploadsAnalyzed?: number
}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PREMIUM_ANALYSIS_UPDATED, { detail }))
}

export function InvoicesUploadedManager() {
  const [uploads, setUploads] = useState<StoredInvoiceUploadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<UploadKey>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmMode, setConfirmMode] = useState<'single' | 'selected' | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<StoredInvoiceUploadItem | null>(null)

  const refreshUploads = useCallback(async () => {
    const res = await fetch('/api/invoices/uploads', { cache: 'no-store' })
    const json = (await res.json()) as { error?: string; uploads?: StoredInvoiceUploadItem[] }
    if (!res.ok) throw new Error(json.error || 'Failed to load uploads')
    const list = json.uploads ?? []
    setUploads(list)
    setSelected((prev) => {
      const valid = new Set(list.map((u) => uploadKey(u)))
      return new Set([...prev].filter((k) => valid.has(k)))
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await refreshUploads()
        if (!cancelled) setError(null)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load uploads.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUploads])

  useEffect(() => {
    function onUpdated() {
      void refreshUploads().catch(() => {})
    }
    window.addEventListener(PREMIUM_ANALYSIS_UPDATED, onUpdated)
    return () => window.removeEventListener(PREMIUM_ANALYSIS_UPDATED, onUpdated)
  }, [refreshUploads])

  const allSelected = uploads.length > 0 && selected.size === uploads.length
  const someSelected = selected.size > 0 && !allSelected
  const selectedItems = useMemo(
    () => uploads.filter((u) => selected.has(uploadKey(u))),
    [uploads, selected]
  )

  function toggleOne(item: StoredInvoiceUploadItem) {
    const key = uploadKey(item)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(uploads.map((u) => uploadKey(u))))
  }

  async function rerunAnalysisAfterDelete(cleared: boolean) {
    if (cleared) {
      dispatchPremiumAnalysisUpdate({ cleared: true })
      return
    }

    const res = await fetch('/api/invoices/analyze', { method: 'POST', cache: 'no-store' })
    const json = (await res.json()) as { error?: string; summary?: unknown; uploadsAnalyzed?: number }
    if (!res.ok) {
      throw new Error(json.error || 'Analysis refresh failed.')
    }
    dispatchPremiumAnalysisUpdate({
      summary: json.summary,
      uploadsAnalyzed: json.uploadsAnalyzed,
    })
  }

  async function performDelete(items: StoredInvoiceUploadItem[]) {
    if (!items.length) return

    setDeleting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/invoices/uploads/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({ id: item.id, source: item.source })),
        }),
      })

      const json = (await res.json()) as {
        error?: string
        deletedCount?: number
        failedCount?: number
        cleared?: boolean
        remainingUploads?: number
      }

      if (!res.ok) {
        throw new Error(json.error || 'Delete failed.')
      }

      await refreshUploads()
      setSelected(new Set())
      setConfirmMode(null)
      setConfirmTarget(null)

      try {
        await rerunAnalysisAfterDelete(Boolean(json.cleared))
      } catch (analyzeErr: unknown) {
        const msg = analyzeErr instanceof Error ? analyzeErr.message : 'Analysis failed.'
        setError(`File(s) removed, but analysis did not finish: ${msg} Use Refresh analysis to recompute.`)
        return
      }

      const deletedCount = json.deletedCount ?? items.length
      if (json.cleared) {
        setSuccess(
          deletedCount === 1
            ? 'Removed the last uploaded file. Premium Analysis has been cleared — upload new invoices to continue.'
            : `Removed ${deletedCount} files. No invoice files remain — upload new invoices to run analysis again.`
        )
      } else {
        setSuccess(
          deletedCount === 1
            ? `Removed 1 file. Analysis updated with your remaining ${json.remainingUploads ?? ''} file(s).`
            : `Removed ${deletedCount} files. Analysis updated with your remaining ${json.remainingUploads ?? ''} file(s).`
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  const confirmCount =
    confirmMode === 'single' && confirmTarget ? 1 : confirmMode === 'selected' ? selectedItems.length : 0

  const confirmItems =
    confirmMode === 'single' && confirmTarget
      ? [confirmTarget]
      : confirmMode === 'selected'
        ? selectedItems
        : []

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Invoices Uploaded</CardTitle>
            <CardDescription>
              Remove files to exclude them from Premium Analysis. Deleting the last file clears your dashboard metrics.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || deleting}
            onClick={() => {
              setLoading(true)
              refreshUploads()
                .catch((e) => setError(e instanceof Error ? e.message : 'Failed to refresh.'))
                .finally(() => setLoading(false))
            }}
          >
            Refresh list
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div aria-live="polite" aria-atomic="true" className="min-h-5 space-y-1">
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

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading uploads…
          </p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoice files uploaded yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleting || selected.size === 0}
                onClick={() => setConfirmMode('selected')}
              >
                Delete selected ({selected.size})
              </Button>
              {selected.size > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </Button>
              ) : null}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      role="checkbox"
                      aria-label="Select all uploaded invoices"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      disabled={deleting}
                      onChange={toggleAll}
                      className="size-4 rounded border border-input accent-primary"
                    />
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Rows / Amount</TableHead>
                  <TableHead className="w-12 text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((item) => {
                  const key = uploadKey(item)
                  const isSelected = selected.has(key)
                  return (
                    <TableRow key={key} data-state={isSelected ? 'selected' : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          role="checkbox"
                          aria-label={`Select ${item.filename}`}
                          checked={isSelected}
                          disabled={deleting}
                          onChange={() => toggleOne(item)}
                          className="size-4 rounded border border-input accent-primary"
                        />
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium" title={item.filename}>
                        {item.filename}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.carrier}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.source === 'csv'
                          ? `${item.row_count?.toLocaleString() ?? '—'} rows`
                          : formatAmount(item.total_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={deleting}
                          aria-label={`Remove ${item.filename}`}
                          onClick={() => {
                            setConfirmTarget(item)
                            setConfirmMode('single')
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        )}

        <Dialog
          open={confirmMode != null}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setConfirmMode(null)
              setConfirmTarget(null)
            }
          }}
        >
          <DialogContent showCloseButton={!deleting}>
            <DialogHeader>
              <DialogTitle>
                {confirmCount === 1 ? 'Remove uploaded file?' : `Remove ${confirmCount} files?`}
              </DialogTitle>
              <DialogDescription>
                {confirmCount === 1 && confirmItems[0] ? (
                  <>
                    <span className="font-medium text-foreground">{confirmItems[0].filename}</span> will be
                    removed from your account. Premium Analysis will recompute using your remaining files, or
                    clear if this was your last upload.
                  </>
                ) : (
                  <>
                    {confirmCount} selected file{confirmCount !== 1 ? 's' : ''} will be removed. Premium
                    Analysis will recompute with whatever remains, or clear if you delete everything.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => {
                  setConfirmMode(null)
                  setConfirmTarget(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || confirmItems.length === 0}
                onClick={() => void performDelete(confirmItems)}
              >
                {deleting ? 'Removing…' : confirmCount === 1 ? 'Remove file' : `Remove ${confirmCount} files`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
