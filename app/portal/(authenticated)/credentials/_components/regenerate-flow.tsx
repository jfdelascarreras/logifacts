'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react'
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

type ModalState = 'idle' | 'confirming' | 'loading' | 'revealing'

function KeyCopyBlock({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative rounded-lg border border-border bg-muted/60 px-4 py-3">
      <p className="break-all font-mono text-sm leading-relaxed">{apiKey}</p>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy API key'}
        className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        {copied ? (
          <CheckIcon className="size-4 text-emerald-500" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
    </div>
  )
}

export function RegenerateFlow() {
  const [modal, setModal] = useState<ModalState>('idle')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleConfirm = async () => {
    setModal('loading')
    setError(null)

    try {
      const res = await fetch('/api/portal/credentials/regenerate', { method: 'POST' })
      const json = (await res.json()) as { key?: string; error?: string }

      if (!res.ok || !json.key) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        setModal('confirming')
        return
      }

      setNewKey(json.key)
      setModal('revealing')
    } catch {
      setError('Network error. Please try again.')
      setModal('confirming')
    }
  }

  const handleRevealClose = () => {
    setModal('idle')
    setNewKey(null)
    // Refresh server component data so the new prefix and history are shown
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Regenerate API Key</h2>
          <p className="text-sm text-muted-foreground">
            Immediately invalidates your current key and issues a new one.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            setError(null)
            setModal('confirming')
          }}
        >
          Regenerate Key
        </Button>
      </div>

      {/* Confirmation modal */}
      <Dialog
        open={modal === 'confirming' || modal === 'loading'}
        onOpenChange={(open) => {
          if (!open && modal !== 'loading') setModal('idle')
        }}
      >
        <DialogContent showCloseButton={modal !== 'loading'}>
          <DialogHeader>
            <DialogTitle>Regenerate API Key?</DialogTitle>
            <DialogDescription>
              This will <strong>immediately invalidate</strong> your current key. Any systems using
              it will stop working until updated with the new key.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModal('idle')}
              disabled={modal === 'loading'}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={modal === 'loading'}
            >
              {modal === 'loading' ? 'Regenerating…' : 'Yes, Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal modal — shown once after successful regeneration */}
      <Dialog open={modal === 'revealing'} onOpenChange={(open) => { if (!open) handleRevealClose() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Your New API Key</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>Copy this key now.</strong> It will not be shown again.
                  </span>
                </div>
                {newKey && <KeyCopyBlock apiKey={newKey} />}
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button onClick={handleRevealClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
