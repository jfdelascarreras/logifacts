import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

const USE_TRANSPARENT_LOGO = false
const HEADER_LOGO_SRC = USE_TRANSPARENT_LOGO
  ? '/logifacts-logo-transparent.png'
  : '/logifacts-logo-default.png'
const SURVEY_URL = 'https://landbot.site/v3/H-3013420-OC0MMSVJBV97BTKR/index.html'

export function LandingHero() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-secondary/30 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-24">
          <header className="flex items-center justify-between">
            <Link href="/" className="shrink-0" aria-label="LogiFacts home">
              <Image
                src={HEADER_LOGO_SRC}
                alt="LogiFacts logo"
                width={1024}
                height={416}
                priority
                className="h-auto w-[180px] sm:w-[240px]"
              />
            </Link>

            <nav className="hidden items-center gap-3 sm:flex">
              <Link
                href="/auth/login"
                className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Sign up
              </Link>
            </nav>
          </header>

          <section className="flex flex-col items-start gap-8">
            <div className="max-w-2xl">
              <h1 className="font-heading text-balance text-4xl font-bold tracking-tight sm:text-5xl">
                Welcome to Logifacts
              </h1>
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
                Get shipment cost visibility and actionable insights in one place. Connect
                data, track KPIs, and optimize carriers with confidence.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <a href={SURVEY_URL}>Join our survey</a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-border bg-background text-foreground hover:bg-muted"
              >
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </div>

            <div className="grid gap-3 pt-2 sm:gap-4 sm:grid-cols-3">
              {[
                { title: 'Cost KPIs', desc: 'Track cost, CPP, and breakdowns.' },
                { title: 'Carrier Insights', desc: 'Understand cost drivers by service and zone.' },
                { title: 'AI Summaries', desc: 'Simple, actionable explanations of trends.' },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-accent/25 bg-card p-4 transition-transform duration-200 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
                >
                  <div className="font-heading text-sm font-semibold tracking-wide text-accent">{item.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <footer className="text-sm text-muted-foreground">
            Built for teams who want cleaner shipment intelligence.
          </footer>
        </div>
      </div>
    </div>
  )
}

