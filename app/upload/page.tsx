'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export default function UploadPage() {
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/invoices/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setResult(json as UploadResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Upload Invoice</h1>
          <p className="text-sm text-muted-foreground">Drag and drop or click to select your invoice file</p>
        </div>

        {/* Format guide */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            { carrier: 'UPS', format: 'CSV', hint: '250-column export', color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200' },
            { carrier: 'FedEx', format: 'XLS', hint: 'Standard invoice export', color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200' },
            { carrier: 'WWE', format: 'XLS', hint: 'World Wide Express', color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-200' },
          ].map(({ carrier, format, hint, color }) => (
            <div key={carrier} className={`rounded-lg border px-3 py-2 ${color}`}>
              <p className="font-semibold">{carrier}</p>
              <p className="font-mono text-[11px] mt-0.5">{format}</p>
              <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>

        {!result ? (
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
                <span className="text-sm font-medium text-foreground">
                  {uploading ? 'Uploading…' : 'Drop file here or click to browse'}
                </span>
                <span className="text-xs text-muted-foreground mt-1">CSV (UPS) · XLS/XLSX (FedEx, WWE)</span>
                <input id="file-input" type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={onFileChange} disabled={uploading} />
              </label>

              {/* UPS reminder */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-semibold">UPS:</span> Download the{' '}
                <span className="font-mono">"Download CSV (250 Columns)"</span> option from the UPS Billing Center →
                My Plan Invoices → three-dot menu. Do <span className="font-semibold">not</span> upload the Excel version.
              </div>

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Parsing and mapping charge lines…
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-green-600">✓</span> Upload Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">Carrier</p>
                  <Badge variant="outline">{result.carrier}</Badge>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">File</p>
                  <p className="font-medium truncate">{result.filename}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">Total Lines</p>
                  <p className="font-semibold">{result.totalLines.toLocaleString()}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">Total Amount</p>
                  <p className="font-semibold">${result.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">Mapped</p>
                  <p className="font-semibold text-green-600">{result.mappedLines.toLocaleString()}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">Unmatched</p>
                  <p className={`font-semibold ${result.unmappedLines > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {result.unmappedLines.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => router.push(`/dashboard/${result.invoiceId}`)}>
                  View Analysis
                </Button>
                <Button variant="outline" onClick={() => { setResult(null); setError(null) }}>
                  Upload Another
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
