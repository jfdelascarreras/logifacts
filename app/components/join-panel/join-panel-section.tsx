'use client'

import { ExternalLink, Headphones, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'

import {
  panelSeries,
  upcomingPanelSessions,
} from '@/app/components/join-panel/data/panel-sessions'
import {
  formatSessionDateLabel,
  sessionMatchesQuery,
} from '@/app/components/join-panel/lib/session-formatters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/** Optional — Spotify / Apple Podcasts / RSS etc. */
const PODCAST_LISTEN_URL = process.env.NEXT_PUBLIC_PODCAST_URL?.trim() ?? ''

/** Same funnel as landing survey — shapes panel & podcast priorities */
const COMMUNITY_SURVEY_URL =
  'https://landbot.site/v3/H-3013420-OC0MMSVJBV97BTKR/index.html'

export function JoinPanelSection() {
  const [searchValue, setSearchValue] = useState('')
  const primarySeries = panelSeries[0]

  const filteredSessions = useMemo(
    () => upcomingPanelSessions.filter((session) => sessionMatchesQuery(session, searchValue)),
    [searchValue]
  )

  return (
    <section className="space-y-8 rounded-2xl border border-border bg-card p-6 md:p-8">
      <header className="space-y-3">
        <h2 className="font-heading text-3xl font-semibold tracking-wide text-foreground">
          Welcome to the LogiFacts community!
        </h2>
        <p className="max-w-5xl text-sm leading-7 text-muted-foreground">
          Joining LogiFacts community focus group is a chance to help shape the future of shipping
          built on clarity, accuracy, and meaningful dialogue. By participating, you become part of
          a thoughtful group of people who learn, share and influence the community around topics
          for the broader shipping community. Its a simple way to make your voice matter while
          connecting with others who care about improving how information is shared and understood.
        </p>
      </header>

      <Card className="overflow-hidden border-secondary/45 bg-gradient-to-br from-secondary/35 via-background to-[color-mix(in_srgb,var(--chart-3)_18%,white)] shadow-sm dark:border-secondary/30 dark:from-secondary/12 dark:via-background dark:to-background">
        <CardContent className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-heading text-base font-semibold leading-tight tracking-wide text-foreground">
              Listen to <span className="text-accent">Just the Facts</span>
            </p>
            <p className="text-xs leading-snug text-muted-foreground sm:text-sm">
              Logistics insights, operator stories, and ideas you can use — tune in and tell us what should be next.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {PODCAST_LISTEN_URL ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-accent px-3 text-accent-foreground hover:bg-accent/90"
                  asChild
                >
                  <a href={PODCAST_LISTEN_URL} target="_blank" rel="noopener noreferrer">
                    <Headphones className="size-3.5 shrink-0" aria-hidden />
                    Listen now
                    <ExternalLink className="size-3 opacity-90" aria-hidden />
                  </a>
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 border-secondary/50 bg-background/80 hover:bg-muted/80" asChild>
                <a href={COMMUNITY_SURVEY_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden />
                  Shape what we cover
                </a>
              </Button>
            </div>
          </div>
          <Image
            src="/join-panel/podcast-invite.png"
            alt="Just the Facts podcast"
            width={168}
            height={84}
            className="mx-auto h-auto max-h-[72px] w-full max-w-[168px] shrink-0 rounded-md border border-border/50 bg-card object-contain sm:mx-0 sm:max-h-[76px]"
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
            Upcoming Panel Sessions
          </h3>
          <p className="text-sm text-muted-foreground">Click &quot;Join&quot; to be added to the waitlist</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {primarySeries.name} | {primarySeries.cadence} | {primarySeries.timezone}
          </p>
        </div>

        <Input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search"
          aria-label="Search panel sessions"
          className="h-10 bg-muted/40"
        />

        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <Card key={session.id} className="border-border/80">
              <CardHeader className="gap-2 sm:flex sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>{session.title}</CardTitle>
                  <CardDescription>{session.details}</CardDescription>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSessionDateLabel(session.startsAt, primarySeries.timezone)}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">{session.seatsLabel}</p>
                <Button variant="outline" disabled>
                  Join (Coming soon)
                </Button>
              </CardContent>
            </Card>
          ))}

          {!filteredSessions.length ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No sessions match your search yet.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
