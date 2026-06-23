'use client'

import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function PostmanDownloadButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/integration/postman')

      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Failed to generate collection')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'logifacts-api.postman_collection.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" onClick={handleDownload} disabled={isLoading}>
        <DownloadIcon className="size-4" />
        {isLoading ? 'Generating…' : 'Download Postman Collection'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
