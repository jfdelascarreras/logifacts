'use client'

import { ExternalLink, CalendarClock, Package, Route, Truck, Video } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  MASTERMIND_SESSION_WHEN,
  MASTERMIND_SESSION_WHEN_LONG,
  MASTERMIND_TEAMS_JOIN_URL,
} from '@/lib/mastermind/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type MastermindSectionProps = {
  initialFullName?: string
  initialCompanyName?: string
  initialEmail?: string
  isSignedIn?: boolean
}

type RegisterResponse = {
  ok?: boolean
  error?: string
  registration?: {
    alreadyRegistered: boolean
  }
}

const HIGHLIGHTS = [
  { icon: Truck, label: 'Carrier billing war stories — not slide decks' },
  { icon: Package, label: 'Surcharges, zones, accessorials — ask anything' },
  { icon: Route, label: 'Operators, TMs, and freight auditors in one room' },
] as const

export function MastermindSection({
  initialFullName = '',
  initialCompanyName = '',
  initialEmail = '',
  isSignedIn = false,
}: MastermindSectionProps) {
  const [fullName, setFullName] = useState(initialFullName)
  const [companyName, setCompanyName] = useState(initialCompanyName)
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [wasAlreadyRegistered, setWasAlreadyRegistered] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/mastermind/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, companyName, email }),
      })

      const payload = (await response.json()) as RegisterResponse

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save your registration.')
      }

      setWasAlreadyRegistered(Boolean(payload.registration?.alreadyRegistered))
      setIsRegistered(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save your registration.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section
      id="mastermind"
      aria-labelledby="mastermind-heading"
      className="relative scroll-mt-8 overflow-hidden py-4 sm:py-6"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-16 top-8 h-56 w-56 rounded-full bg-secondary/35 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute right-1/3 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--chart-3)_40%,transparent)] blur-2xl" />
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="relative aspect-[4/3] w-full sm:aspect-[5/4]">
            <div className="absolute inset-[8%] rounded-[2rem] bg-gradient-to-br from-secondary/50 via-[color-mix(in_srgb,var(--chart-3)_35%,white)] to-accent/20" />
            <div className="absolute inset-0 flex items-center justify-center p-8 sm:p-10">
              <Image
                src="/join-panel/podcast-invite.png"
                alt="LogiFacts Mastermind — live operator roundtable for shippers"
                width={420}
                height={210}
                className="relative z-10 h-auto w-full max-w-[320px] object-contain drop-shadow-lg sm:max-w-[360px]"
              />
            </div>
            <div className="absolute left-0 top-6 z-20 rounded-2xl bg-background/90 px-3 py-2 shadow-sm backdrop-blur-sm">
              <p className="font-heading text-xs font-semibold uppercase tracking-[0.18em] text-accent">First session</p>
              <p className="text-sm font-medium text-foreground">{MASTERMIND_SESSION_WHEN}</p>
            </div>
            <div className="absolute bottom-4 right-0 z-20 max-w-[12rem] rounded-2xl bg-[color-mix(in_srgb,var(--chart-1)_92%,transparent)] px-3 py-2 text-white shadow-md">
              <p className="text-xs leading-snug opacity-90">Operators · TMs · Freight audit</p>
              <p className="font-heading text-sm font-semibold">Your lane, your voice</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <header className="space-y-4">
            <p className="font-heading text-sm font-semibold uppercase tracking-[0.2em] text-accent">
              You&apos;re invited
            </p>
            <h2
              id="mastermind-heading"
              className="font-heading text-balance text-3xl font-semibold tracking-wide text-foreground sm:text-4xl"
            >
              Join our upcoming Mastermind — built for operators who live freight every day
            </h2>
            <div
              className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3"
              role="note"
              aria-label={`Session date and time: ${MASTERMIND_SESSION_WHEN_LONG}`}
            >
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div className="space-y-1">
                <p className="font-heading text-sm font-semibold tracking-wide text-foreground">
                  {MASTERMIND_SESSION_WHEN}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {MASTERMIND_SESSION_WHEN_LONG}
                </p>
              </div>
            </div>
            <p className="max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
              Parcel invoices, accessorials, zone gaps, rate cards — the work is rarely simple, and
              rarely solo. This is a live session with transportation managers, freight analysts, and
              logistics operators who know the grind. Bring your carrier questions. Leave with sharper
              spend visibility and peers on the same lane.
            </p>
            <ul className="space-y-2.5 pt-1">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-foreground">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </header>

          {isRegistered ? (
            <div className="space-y-5 border-t border-border/60 pt-6">
              <div className="space-y-2">
                <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
                  {wasAlreadyRegistered
                    ? "You're already on the manifest — glad to have you back"
                    : "You're on the manifest — see you in the room"}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {wasAlreadyRegistered
                    ? `Your registration is updated. We'll see you ${MASTERMIND_SESSION_WHEN}.`
                    : `Your seat is saved for ${MASTERMIND_SESSION_WHEN}. When we go live, you belong in this freight conversation.`}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Save the Teams link below — one click at 12:00 PM EST on June 25 and you&apos;re on the call with fellow shippers and operators.
              </p>
              <Button
                type="button"
                size="lg"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                asChild
              >
                <a href={MASTERMIND_TEAMS_JOIN_URL} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4 shrink-0" aria-hidden />
                  Join the operator call on Teams
                  <ExternalLink className="size-3.5 opacity-90" aria-hidden />
                </a>
              </Button>
              {!isSignedIn ? (
                <p className="text-sm text-muted-foreground">
                  Want parcel spend intelligence between sessions?{' '}
                  <Link
                    href="/auth/sign-up"
                    className="text-accent underline underline-offset-4 transition-colors hover:text-accent/85"
                  >
                    Create a free LogiFacts account
                  </Link>{' '}
                  and stay in the shipper community.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="border-t border-border/60 pt-6">
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                Tell us your name and shipper — we&apos;ll welcome you by name on {MASTERMIND_SESSION_WHEN}.
              </p>
              <form onSubmit={handleSubmit} noValidate aria-busy={isLoading} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="mastermind-full-name">Name</Label>
                    <Input
                      id="mastermind-full-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Jane Smith"
                      className="border-0 border-b border-border/80 bg-transparent px-0 shadow-none rounded-none focus-visible:border-accent focus-visible:ring-0"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mastermind-company-name">Shipper / company</Label>
                    <Input
                      id="mastermind-company-name"
                      type="text"
                      autoComplete="organization"
                      required
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Acme Freight Co."
                      className="border-0 border-b border-border/80 bg-transparent px-0 shadow-none rounded-none focus-visible:border-accent focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="mastermind-email">Email</Label>
                  <Input
                    id="mastermind-email"
                    type="email"
                    autoComplete="email"
                    required
                    readOnly={isSignedIn}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="jane@company.com"
                    className="border-0 border-b border-border/80 bg-transparent px-0 shadow-none rounded-none focus-visible:border-accent focus-visible:ring-0"
                    aria-describedby={isSignedIn ? 'mastermind-email-help' : undefined}
                  />
                  {isSignedIn ? (
                    <p id="mastermind-email-help" className="text-xs text-muted-foreground">
                      We&apos;ll use your account email — one operator, one seat on the manifest.
                    </p>
                  ) : null}
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    size="lg"
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving your seat…' : 'Save my seat at the table'}
                  </Button>
                  {!isSignedIn ? (
                    <p className="text-sm text-muted-foreground">
                      Already part of LogiFacts?{' '}
                      <Link
                        href="/auth/login"
                        className="text-accent underline underline-offset-4 hover:text-accent/85"
                      >
                        Sign in
                      </Link>{' '}
                      and we&apos;ll fill this in for you.
                    </p>
                  ) : null}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
