'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface Props {
  customerId: string
  keyPrefix: string | null
  isActive: boolean
  lastUsedAt: string | null
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (non-HTTPS or denied)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  )
}

function CredentialRow({
  label,
  value,
  copyValue,
  copyLabel,
  mono = true,
}: {
  label: string
  value: React.ReactNode
  copyValue?: string
  copyLabel?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('flex-1', mono && 'font-mono')}>{value}</span>
      {copyValue && copyLabel && (
        <CopyButton text={copyValue} label={copyLabel} />
      )}
    </div>
  )
}

function formatLastUsed(ts: string | null): string {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CredentialsDisplay({ customerId, keyPrefix, isActive, lastUsedAt }: Props) {
  const displayPrefix = keyPrefix ? `lf_${keyPrefix}` : '—'

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="divide-y divide-border px-5">
        <CredentialRow
          label="Customer ID"
          value={customerId}
          copyValue={customerId}
          copyLabel="customer ID"
        />

        <CredentialRow
          label="Key Prefix"
          value={displayPrefix}
          copyValue={keyPrefix ? displayPrefix : undefined}
          copyLabel="key prefix"
        />

        <CredentialRow
          label="Status"
          mono={false}
          value={
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  isActive ? 'bg-emerald-500' : 'bg-muted-foreground'
                )}
              />
              {isActive ? 'Active' : 'Inactive'}
            </span>
          }
        />

        <CredentialRow
          label="Last Used"
          mono={false}
          value={formatLastUsed(lastUsedAt)}
        />
      </div>

      <div className="border-t border-border bg-muted/30 px-5 py-4">
        <p className="text-xs text-muted-foreground">
          Your full API key was provided when your account was created. For security, it cannot be
          retrieved. If lost, regenerate below.
        </p>
      </div>
    </div>
  )
}
