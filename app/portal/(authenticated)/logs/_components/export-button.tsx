'use client'

import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { LogFilters } from './filter-bar'

export function ExportButton({ filters }: { filters: LogFilters }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ format: 'csv' })
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.status !== 'all') params.set('status', filters.status)
      if (filters.originZip) params.set('origin_zip', filters.originZip)
      if (filters.destZip) params.set('dest_zip', filters.destZip)
      if (filters.minWeight) params.set('min_weight', filters.minWeight)
      if (filters.maxWeight) params.set('max_weight', filters.maxWeight)

      const res = await fetch(`/api/portal/logs?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed. Please try again.')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'logifacts-requests.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
        <DownloadIcon className="size-3.5" />
        {loading ? 'Exporting…' : 'Export CSV'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
