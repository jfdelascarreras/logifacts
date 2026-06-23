'use client'

import { useRef, useState } from 'react'
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
import { KeyRevealDialog } from './key-reveal-dialog'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

type Field = {
  name: string
  label: string
  type?: string
  placeholder?: string
  hint?: string
  required?: boolean
}

const FIELDS: Field[] = [
  { name: 'name', label: 'Company / Customer Name', placeholder: 'Club Colors', required: true },
  {
    name: 'customer_id',
    label: 'Customer ID',
    placeholder: 'club_colors',
    hint: 'Lowercase letters, numbers, underscores. Auto-filled from name.',
    required: true,
  },
  { name: 'email', label: 'Login Email', type: 'email', placeholder: 'user@company.com', required: true },
]

export function CreateCustomerModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [customerIdManuallyEdited, setCustomerIdManuallyEdited] = useState(false)
  const [enforceDiscounts, setEnforceDiscounts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (customerIdManuallyEdited) return
    const idInput = formRef.current?.elements.namedItem('customer_id') as HTMLInputElement | null
    if (idInput) idInput.value = slugify(e.target.value)
  }

  function handleCustomerIdChange() {
    setCustomerIdManuallyEdited(true)
  }

  function handleClose() {
    if (loading) return
    setError(null)
    setCustomerIdManuallyEdited(false)
    setEnforceDiscounts(false)
    formRef.current?.reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current) return

    const data = new FormData(formRef.current)
    const name = (data.get('name') as string).trim()
    const customer_id = (data.get('customer_id') as string).trim()
    const email = (data.get('email') as string).trim()

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/v2/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, customer_id, email, enforce_discounts: enforceDiscounts }),
      })

      const json = await res.json() as Record<string, unknown>

      if (!res.ok) {
        setError(String(json.error ?? 'Failed to create customer.'))
        return
      }

      handleClose()
      setRevealedKey(String(json.api_key))
    } finally {
      setLoading(false)
    }
  }

  function handleRevealClose() {
    setRevealedKey(null)
    router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(e) => { if (loading) e.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
            <DialogDescription>
              Creates a Supabase user account, sends an invite email, and generates the first API key.
            </DialogDescription>
          </DialogHeader>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <label
                  htmlFor={f.name}
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {f.label}
                  {f.required && <span className="ml-0.5 text-destructive">*</span>}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  required={f.required}
                  onChange={
                    f.name === 'name'
                      ? handleNameChange
                      : f.name === 'customer_id'
                      ? handleCustomerIdChange
                      : undefined
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            ))}

            {/* Enforce discounts toggle */}
            <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={enforceDiscounts}
                onClick={() => setEnforceDiscounts((v) => !v)}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                  enforceDiscounts ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    enforceDiscounts ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-foreground">Enforce contract discounts</p>
                <p className="text-[11px] text-muted-foreground">
                  Reject rate requests if no contract discounts are configured for this customer.
                </p>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating…' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Show the generated key after dialog closes */}
      {revealedKey && (
        <KeyRevealDialog
          open
          apiKey={revealedKey}
          title="Customer Created"
          description="An invite email has been sent. Share this API key with the customer — it cannot be recovered."
          onClose={handleRevealClose}
        />
      )}
    </>
  )
}
