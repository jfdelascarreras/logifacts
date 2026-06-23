'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, ClipboardIcon, TriangleAlertIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { KeyRevealDialog } from './key-reveal-dialog'
import type { CustomerRow } from './customers-shell'

// ── Readiness checklist ───────────────────────────────────────────────────────

function ChecklistItem({ pass, label }: { pass: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={
          pass
            ? 'text-emerald-500'
            : 'text-muted-foreground'
        }
      >
        {pass ? '✓' : '○'}
      </span>
      <span className={pass ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </li>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 text-muted-foreground hover:text-foreground"
      aria-label="Copy user ID"
    >
      {copied ? <CheckIcon className="size-3.5 text-emerald-500" /> : <ClipboardIcon className="size-3.5" />}
    </button>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

type ConfirmAction = 'revoke' | 'regenerate'

function ConfirmDialog({
  action,
  customerName,
  open,
  loading,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction
  customerName: string
  open: boolean
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isRevoke = action === 'revoke'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent onInteractOutside={(e) => { if (loading) e.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>{isRevoke ? 'Revoke API Key' : 'Regenerate API Key'}</DialogTitle>
          <DialogDescription>
            {isRevoke
              ? `This will immediately revoke all active keys for ${customerName}. Their API calls will fail until a new key is issued.`
              : `This will generate a new API key for ${customerName} and revoke the old one. The new key will be shown once.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={isRevoke ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (isRevoke ? 'Revoking…' : 'Regenerating…') : (isRevoke ? 'Revoke Key' : 'Regenerate Key')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function CustomerPanel({
  customer,
  open,
  onClose,
}: {
  customer: CustomerRow | null
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  async function runAction(action: ConfirmAction) {
    if (!customer) return
    setActionLoading(true)
    setActionError(null)

    try {
      const res = await fetch(
        `/api/admin/v2/customers/${customer.customer_id}/${action}`,
        { method: 'POST' },
      )
      const json = await res.json() as Record<string, unknown>

      if (!res.ok) {
        setActionError(String(json.error ?? 'Action failed.'))
        return
      }

      setConfirmAction(null)

      if (action === 'regenerate' && typeof json.api_key === 'string') {
        setRevealedKey(json.api_key)
      } else {
        router.refresh()
      }
    } finally {
      setActionLoading(false)
    }
  }

  function handleRevealClose() {
    setRevealedKey(null)
    router.refresh()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          {customer ? (
            <>
              {/* Header */}
              <SheetHeader className="border-b border-border p-5">
                <SheetTitle>{customer.name ?? customer.customer_id}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {customer.customer_id}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-5">
                {/* Readiness checklist */}
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Readiness
                  </p>
                  <ul className="space-y-1.5">
                    <ChecklistItem pass={customer.hasActiveKey} label="Active API key" />
                    <ChecklistItem pass={customer.hasDiscounts} label="Contract discounts configured" />
                    <ChecklistItem pass={customer.recentRequestCount > 0} label="Test request made (last 30 days)" />
                  </ul>
                </section>

                {/* Discounts warning */}
                {!customer.hasDiscounts && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Discounts not configured</p>
                      <p className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">
                        Rates will reflect published carrier prices until discounts are set in{' '}
                        <code className="rounded bg-amber-500/20 px-1">user_contract_discounts</code>{' '}
                        for user{' '}
                        <span className="font-mono">{customer.user_id.slice(0, 8)}…</span>
                        <CopyIdButton value={customer.user_id} />
                      </p>
                    </div>
                  </div>
                )}

                {/* Usage summary */}
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Usage
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Last 30 days</p>
                      <p className="mt-0.5 text-xl font-bold text-foreground">
                        {customer.recentRequestCount.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground">requests</p>
                    </div>
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Last active</p>
                      <p className="mt-0.5 text-sm font-medium text-foreground">
                        {fmtDate(customer.lastActive)}
                      </p>
                    </div>
                  </div>
                </section>

                {/* API Key */}
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    API Key
                  </p>
                  <div className="rounded-lg border border-border px-4 py-3 text-sm">
                    {customer.keyPrefix ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono font-medium text-foreground">
                            lf_{customer.keyPrefix}
                          </span>
                          <span className="ml-1 text-muted-foreground">••••••••••••••••</span>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          Last used: {fmtDate(customer.keyLastUsed)}
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No active key</p>
                    )}
                  </div>
                </section>

                {/* Error */}
                {actionError && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {actionError}
                  </p>
                )}

                {/* Actions */}
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setActionError(null); setConfirmAction('regenerate') }}
                    >
                      Regenerate Key
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setActionError(null); setConfirmAction('revoke') }}
                      disabled={!customer.hasActiveKey}
                      className="text-destructive hover:text-destructive"
                    >
                      Revoke Key
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Revoking all keys prevents API access until a new key is generated.
                  </p>
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Confirm dialog — rendered outside Sheet so it doesn't conflict with Sheet portal */}
      {confirmAction && customer && (
        <ConfirmDialog
          action={confirmAction}
          customerName={customer.name ?? customer.customer_id}
          open
          loading={actionLoading}
          onConfirm={() => runAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Key reveal — for regenerate */}
      {revealedKey && (
        <KeyRevealDialog
          open
          apiKey={revealedKey}
          title="New API Key"
          description="Share this key with the customer. It will not be shown again."
          onClose={handleRevealClose}
        />
      )}
    </>
  )
}
