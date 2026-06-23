'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy API key'}
      className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
    >
      {copied ? (
        <CheckIcon className="size-4 text-emerald-400" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  )
}

type Props = {
  open: boolean
  onClose: () => void
  apiKey: string
  title?: string
  description?: string
}

export function KeyRevealDialog({
  open,
  onClose,
  apiKey,
  title = 'API Key Generated',
  description = 'Copy this key now — it will never be shown again.',
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            Store this key securely. It cannot be recovered after closing this dialog.
          </div>

          <div className="relative overflow-hidden rounded-lg bg-zinc-950">
            <div className="absolute right-1 top-1">
              <CopyButton text={apiKey} />
            </div>
            <pre className="overflow-x-auto p-4 pr-10 font-mono text-xs leading-relaxed text-zinc-100">
              {apiKey}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>I&apos;ve saved this key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
