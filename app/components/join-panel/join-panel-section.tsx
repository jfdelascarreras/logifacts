'use client'

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

      <div className="space-y-4">
        <div>
          <h3 className="font-heading text-2xl font-semibold tracking-wide text-foreground">
            Upcoming Panel Sessions
          </h3>
          <p className="text-sm text-muted-foreground">Click "Join" to be added to the waitlist</p>
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
