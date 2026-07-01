'use client'

import { BellRing } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function MastermindNotify() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [alreadyIn, setAlreadyIn] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/mastermind/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json()) as { ok?: boolean; alreadyRegistered?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setAlreadyIn(Boolean(data.alreadyRegistered))
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/5 px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent sm:mt-0">
            <BellRing className="size-4" aria-hidden />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold tracking-wide text-foreground sm:text-base">
              JustTheFacts — Mastermind Sessions
            </p>
            <p className="text-sm text-muted-foreground">
              Get notified when we host our next session for business leaders and analysts.
            </p>
          </div>
        </div>

        {status === 'done' ? (
          <p className="text-sm font-medium text-accent sm:shrink-0">
            {alreadyIn ? "You're already on the list." : "You're on the list!"}
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex w-full gap-2 sm:w-auto sm:shrink-0"
            aria-label="Notify me about the next JustTheFacts Mastermind"
          >
            <Input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-full border-accent/30 bg-background text-sm sm:w-52"
              aria-label="Email address"
              disabled={status === 'loading'}
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 shrink-0 rounded-full bg-accent px-4 text-accent-foreground hover:bg-accent/90"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Saving…' : 'Notify me'}
            </Button>
          </form>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Something went wrong — please try again.
        </p>
      )}
    </div>
  )
}
