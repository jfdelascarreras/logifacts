'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon, FlaskConicalIcon, TriangleAlertIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = { hasExistingTestKey: boolean }
type State = 'idle' | 'loading' | 'revealing'

function KeyCopyBlock({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-lg border border-border bg-muted/60 px-4 py-3">
      <p className="break-all font-mono text-sm leading-relaxed">{apiKey}</p>
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 3000) }
          catch { /* ignore */ }
        }}
        aria-label={copied ? 'Copied' : 'Copy test API key'}
        className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        {copied ? <CheckIcon className="size-4 text-emerald-500" /> : <CopyIcon className="size-4" />}
      </button>
    </div>
  )
}

export function TestKeyFlow({ hasExistingTestKey }: Props) {
  const [state, setState] = useState<State>('idle')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleGenerate = async () => {
    setState('loading')
    setError(null)
    try {
      const res  = await fetch('/api/portal/credentials/generate-test-key', { method: 'POST' })
      const json = (await res.json()) as { key?: string; error?: { message: string } | string }
      if (!res.ok || !json.key) {
        const msg = typeof json.error === 'object' ? json.error?.message : json.error
        setError(msg ?? 'Something went wrong. Please try again.')
        setState('idle')
        return
      }
      setNewKey(json.key)
      setState('revealing')
    } catch {
      setError('Network error. Please try again.')
      setState('idle')
    }
  }

  const handleClose = () => {
    setState('idle')
    setNewKey(null)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Sandbox Test Key</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Starts with <span className="font-mono text-xs">lf_test_</span>. Returns deterministic
            mock rates ($9.99) without calling real carrier APIs. Safe for CI and development.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={state === 'loading'}
          className="shrink-0"
        >
          {state === 'loading' ? 'Generating…' : hasExistingTestKey ? 'Regenerate' : 'Generate Test Key'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog open={state === 'revealing'} onOpenChange={(open) => { if (!open) handleClose() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Your Test API Key</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>Copy this key now.</strong> It will not be shown again.
                  </span>
                </div>
                {newKey && <KeyCopyBlock apiKey={newKey} />}
                <p className="text-xs text-muted-foreground">
                  This key returns mock rates and never touches real carrier pricing.
                  Use it freely in dev and CI.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
