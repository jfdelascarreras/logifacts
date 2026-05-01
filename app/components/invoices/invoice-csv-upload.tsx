'use client'

import { useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { parseInvoiceCsvText } from '@/lib/invoice-csv'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function InvoiceCsvUpload() {
  const supabase = useMemo(() => createClient(), [])

  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<null | {
    totalRows: number
    totals: {
      netAmount: number
      invoiceAmount: number
      dutyAmount: number
    }
    byCarrier: Record<
      string,
      { shipmentCount: number; totalNetAmount: number; totalInvoiceAmount: number }
    >
    byService: Record<
      string,
      { shipmentCount: number; totalNetAmount: number; totalInvoiceAmount: number }
    >
  }>(null)
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

    setIsUploading(true)
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (userErr || !user) throw new Error('Not authenticated.')

      const { data: existingUploads, error: existingError } = await supabase
        .from('invoice_uploads')
        .select('original_file_name')
        .eq('user_id', user.id)

      if (existingError) throw existingError

      const existingNames = new Set((existingUploads ?? []).map((r) => r.original_file_name))
      const seenInBatch = new Set<string>()

      const insertedRows: Array<{
        user_id: string
        original_file_name: string
        csv_text: string
        row_count: number
        status: string
      }> = []

      let skippedDuplicates = 0
      let skippedOversized = 0
      let skippedEmpty = 0
      for (const file of files) {
        if (existingNames.has(file.name) || seenInBatch.has(file.name)) {
          skippedDuplicates += 1
          continue
        }

        if (file.size > maxBytes) {
          skippedOversized += 1
          continue
        }

        const csvText = await file.text()

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
        })
        seenInBatch.add(file.name)
      }

      if (!insertedRows.length) {
        const parts: string[] = []
        if (skippedDuplicates > 0) {
          parts.push(
            `${skippedDuplicates} file(s) skipped — already uploaded (same file name). Rename the file or delete the old upload in the database.`
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

      const { error: insertErr } = await supabase.from('invoice_uploads').insert(insertedRows)
      if (insertErr) throw insertErr

      const skippedTotal = skippedDuplicates + skippedOversized + skippedEmpty
      setSuccess(
        `Uploaded ${insertedRows.length} file(s)${
          skippedTotal
            ? `, skipped ${skippedTotal} (${[skippedDuplicates && `${skippedDuplicates} duplicate`, skippedOversized && `${skippedOversized} too large`, skippedEmpty && `${skippedEmpty} empty/unreadable`].filter(Boolean).join(', ')})`
            : ''
        }. Run analysis here or scroll down and choose Refresh analysis to update your dashboard.`
      )
      setFiles([])
      await refreshRecent()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleAnalyze() {
    setError(null)
    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/invoices/analyze', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to analyze invoices.')
      }
      setAnalysis(json.summary)
      setSuccess('Analysis complete.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to analyze invoices.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-accent/25 bg-card">
        <CardHeader>
          <CardTitle className="text-accent">Upload invoice CSVs</CardTitle>
          <CardDescription>
            Add carrier invoice exports (comma-separated CSV). Files are saved to your account; use{' '}
            <strong className="font-medium text-foreground">Refresh analysis</strong> in the metrics section
            below (or <strong className="font-medium text-foreground">Analyze all uploads</strong> here) to compute
            Premium Analysis from everything you have uploaded.
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
                  Selected {files.length} file(s). UPS header mapping will be applied to each.
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
              <Button onClick={handleUpload} disabled={!files.length || isUploading}>
                {isUploading ? 'Uploading...' : 'Upload CSV'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-accent/40 text-accent hover:bg-accent/10"
                disabled={isUploading}
                onClick={() => {
                  refreshRecent().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load uploads.'))
                }}
              >
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-accent/40 text-accent hover:bg-accent/10"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze all uploads'}
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

            {analysis ? (
              <div className="mt-4 space-y-3 rounded-lg border border-accent/25 bg-background p-3 text-sm shadow-sm">
                <div className="font-heading font-semibold tracking-wide text-accent">Summary</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Rows</div>
                    <div>{analysis.totalRows}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Invoice Amount (total)</div>
                    <div>{analysis.totals.invoiceAmount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Net Amount (total)</div>
                    <div>{analysis.totals.netAmount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Duty Amount (total)</div>
                    <div>{analysis.totals.dutyAmount.toFixed(2)}</div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Top carriers by net amount
                    </div>
                    <div className="space-y-1">
                      {Object.entries(analysis.byCarrier)
                        .sort((a, b) => b[1].totalNetAmount - a[1].totalNetAmount)
                        .slice(0, 3)
                        .map(([carrier, v]) => (
                          <div key={carrier} className="flex items-center justify-between gap-2">
                            <span className="truncate">{carrier}</span>
                            <span className="text-xs text-muted-foreground">
                              {v.shipmentCount} · {v.totalNetAmount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Top services by net amount
                    </div>
                    <div className="space-y-1">
                      {Object.entries(analysis.byService)
                        .sort((a, b) => b[1].totalNetAmount - a[1].totalNetAmount)
                        .slice(0, 3)
                        .map(([service, v]) => (
                          <div key={service} className="flex items-center justify-between gap-2">
                            <span className="truncate">{service}</span>
                            <span className="text-xs text-muted-foreground">
                              {v.shipmentCount} · {v.totalNetAmount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

