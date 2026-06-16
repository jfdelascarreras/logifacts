'use client'

import { ArrowRight, CalendarClock, ExternalLink, Gauge, Target, Users, Video } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  MASTERMIND_SESSION_DURATION,
  MASTERMIND_SESSION_WHEN,
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
  {
    icon: Target,
    title: 'Measure what moves the needle',
    description:
      'Stop tracking vanity metrics. Learn the one question that reveals whether your data is driving the right outcomes and behaviors.',
  },
  {
    icon: Users,
    title: 'Get your numbers in front of the people who decide',
    description:
      "Insight only matters if it reaches the right people at the moment of decision. We'll show you how to communicate data so it actually changes what people do.",
  },
  {
    icon: Gauge,
    title: 'Know if "good" is actually good',
    description:
      'Without a benchmark, every number is just noise. Walk away able to tell at a glance whether a result is a win or a warning sign.',
  },
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
                alt="LogiFacts Mastermind — free conversation for business leaders and analysts"
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
              <p className="text-xs leading-snug opacity-90">Free · {MASTERMIND_SESSION_DURATION}</p>
              <p className="font-heading text-sm font-semibold">Spots are limited</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <header className="space-y-4">
            <h2
              id="mastermind-heading"
              className="font-heading text-balance text-3xl font-semibold tracking-wide text-foreground sm:text-4xl"
            >
              Join Our Mastermind!
            </h2>
            <p className="font-heading text-xl font-semibold tracking-wide text-accent sm:text-2xl">
              Ready to Measure What Actually Matters?
            </p>
            <div
              className="flex max-w-xl items-start gap-3 rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3.5 sm:px-5 sm:py-4"
              role="note"
              aria-label={`Free Mastermind session on ${MASTERMIND_SESSION_WHEN} for business leaders and analysts`}
            >
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div className="space-y-1.5">
                <p className="text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
                  Join us for a free {MASTERMIND_SESSION_DURATION} Mastermind conversation on{' '}
                  <span className="font-semibold text-foreground">{MASTERMIND_SESSION_WHEN}</span>.
                </p>
                <p className="font-heading text-sm font-semibold tracking-wide text-accent sm:text-base">
                  Built for business leaders and analysts who are ready to think differently about
                  performance.
                </p>
              </div>
            </div>
            <p className="max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
              We&apos;ll explore how to re-imagine the way you measure your business, what&apos;s
              working, what isn&apos;t, and how to close the gap. You&apos;ll leave with at least one
              practical measurement insight you can put to work immediately.
            </p>
            <ul className="space-y-3 pt-1">
              {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="leading-relaxed">
                    <span className="font-medium">{title}</span>
                    <span className="text-muted-foreground"> — {description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </header>

          {isRegistered ? (
            <div className="space-y-5 border-t border-border/60 pt-6">
              <div className="space-y-2">
                <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
                  {wasAlreadyRegistered ? "You're already signed up" : "You're signed up!"}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {wasAlreadyRegistered
                    ? `Your registration is updated. We'll see you ${MASTERMIND_SESSION_WHEN}.`
                    : `Your spot is saved for ${MASTERMIND_SESSION_WHEN}. Here are your session details below.`}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Use the link below to join the conversation — save it now so you have your calendar
                invite details ready.
              </p>
              <Button
                type="button"
                size="lg"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                asChild
              >
                <a href={MASTERMIND_TEAMS_JOIN_URL} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4 shrink-0" aria-hidden />
                  Join on Teams
                  <ExternalLink className="size-3.5 opacity-90" aria-hidden />
                </a>
              </Button>
              {!isSignedIn ? (
                <p className="text-sm text-muted-foreground">
                  Want more from LogiFacts between sessions?{' '}
                  <Link
                    href="/auth/sign-up"
                    className="text-accent underline underline-offset-4 transition-colors hover:text-accent/85"
                  >
                    Create a free account
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          ) : (
            <div className="border-t border-border/60 pt-6">
              <p className="mb-5 text-sm font-medium text-foreground">Spots are limited.</p>
              <form onSubmit={handleSubmit} noValidate aria-busy={isLoading} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="mastermind-full-name">Name</Label>
                    <div className="mastermind-input-glaze relative px-1 py-0.5">
                      <Input
                        id="mastermind-full-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Jane Smith"
                        className="rounded-none border-0 border-b border-border/80 bg-transparent px-0 shadow-none focus-visible:border-accent focus-visible:ring-0"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mastermind-company-name">Company Name</Label>
                    <div className="mastermind-input-glaze mastermind-input-glaze-delay-1 relative px-1 py-0.5">
                      <Input
                        id="mastermind-company-name"
                        type="text"
                        autoComplete="organization"
                        required
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Acme Co."
                        className="rounded-none border-0 border-b border-border/80 bg-transparent px-0 shadow-none focus-visible:border-accent focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="mastermind-email">Email</Label>
                  <div className="mastermind-input-glaze mastermind-input-glaze-delay-2 relative px-1 py-0.5">
                    <Input
                      id="mastermind-email"
                      type="email"
                      autoComplete="email"
                      required
                      readOnly={isSignedIn}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="jane@company.com"
                      className="rounded-none border-0 border-b border-border/80 bg-transparent px-0 shadow-none focus-visible:border-accent focus-visible:ring-0"
                      aria-describedby={isSignedIn ? 'mastermind-email-help' : undefined}
                    />
                  </div>
                  {isSignedIn ? (
                    <p id="mastermind-email-help" className="text-xs text-muted-foreground">
                      We&apos;ll use your account email so you&apos;re not registered twice.
                    </p>
                  ) : null}
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 pt-1">
                  <Button
                    type="submit"
                    size="lg"
                    className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      'Signing you up…'
                    ) : (
                      <>
                        Sign Up Now and get the calendar invite with details
                        <ArrowRight className="size-4 shrink-0" aria-hidden />
                      </>
                    )}
                  </Button>
                  {!isSignedIn ? (
                    <p className="text-sm text-muted-foreground">
                      Already have a LogiFacts account?{' '}
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
