'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

interface CloseAccountSectionProps {
  email: string
}

export function CloseAccountSection({ email }: CloseAccountSectionProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const resetDialog = () => {
    setConfirmEmail('')
    setPassword('')
    setError(null)
  }

  const handleCloseAccount = async () => {
    setIsClosing(true)
    setError(null)

    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail, password }),
      })

      const payload = (await response.json()) as { error?: string; ok?: boolean }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to close account.')
      }

      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/?accountClosed=1')
      router.refresh()
    } catch (closeError: unknown) {
      setError(closeError instanceof Error ? closeError.message : 'Unable to close account.')
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <section className="rounded-2xl border border-destructive/30 bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Close account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Permanently delete your LogiFacts account, uploaded invoices, and analysis data. This cannot
        be undone.
      </p>
      <Button
        type="button"
        variant="destructive"
        className="mt-4"
        onClick={() => {
          resetDialog()
          setOpen(true)
        }}
      >
        Close my account
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isClosing) {
            setOpen(false)
            resetDialog()
          }
        }}
      >
        <DialogContent showCloseButton={!isClosing}>
          <DialogHeader>
            <DialogTitle>Close your account?</DialogTitle>
            <DialogDescription>
              All uploads and premium analysis data for{' '}
              <span className="font-medium text-foreground">{email}</span> will be permanently
              removed. Enter your email and password to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="close-account-email">Email</Label>
              <Input
                id="close-account-email"
                type="email"
                autoComplete="email"
                placeholder={email}
                value={confirmEmail}
                disabled={isClosing}
                onChange={(event) => setConfirmEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="close-account-password">Password</Label>
              <Input
                id="close-account-password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={isClosing}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isClosing}
              onClick={() => {
                setOpen(false)
                resetDialog()
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isClosing || !confirmEmail.trim() || !password}
              onClick={() => void handleCloseAccount()}
            >
              {isClosing ? 'Closing account…' : 'Permanently close account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
