import Link from 'next/link'

import { LandingHero } from '@/app/components/landing/landing-hero'
import { MastermindSection } from '@/app/components/landing/mastermind-section'
import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <LandingHero />
  }

  const metadata = user.user_metadata ?? {}

  return (
    <AuthenticatedShell title="Home" subtitle="Welcome to your LogiFacts workspace.">
      <div className="space-y-8">
        <MastermindSection
          initialFullName={String(metadata.full_name ?? metadata.fullName ?? '').trim()}
          initialCompanyName={String(metadata.company_name ?? '').trim()}
          initialEmail={user.email?.trim() ?? ''}
          isSignedIn
        />
        <section className="rounded-2xl border border-border bg-muted/40 px-6 py-10 text-center sm:px-10">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Welcome to the LogiFacts Research Portal
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
            Access benchmark reports, logistics research, and industry insights based on
            aggregated survey data from industry professionals.
          </p>
          <div className="mt-6">
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/my-benchmark">My Benchmark</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-background p-6 sm:grid-cols-3">
          {[
            { value: '30,000+', label: 'Shippers Interviewed' },
            { value: '18', label: 'Categorized Industries' },
            { value: '30+', label: 'Data Points Analyzed' },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="font-heading text-4xl font-bold text-foreground">{item.value}</div>
              <div className="mt-2 text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-muted/30 px-6 py-8 sm:px-8">
          <h3 className="text-center font-heading text-3xl font-bold text-foreground">
            Premium Research Tools
          </h3>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-border bg-card p-6">
              <h4 className="font-heading text-2xl font-semibold text-foreground">
                Subscription & Pricing Model
              </h4>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Our pricing is tailored to your business size and shipping volume. Subscription
                tiers are based on your annualized shipping spend, ensuring you get the right
                level of insights and support for your logistics operations.
              </p>
            </article>

            <article className="rounded-xl border border-border bg-card p-6">
              <h4 className="font-heading text-2xl font-semibold text-foreground">
                Pricing Optimization Services
              </h4>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Unlock powerful tools to optimize your logistics costs:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
                <li>Pricing optimization reporting to identify cost-saving opportunities</li>
                <li>Pricing tier analysis to benchmark your rates against industry standards</li>
                <li>Contract negotiation playbook with proven strategies and templates</li>
              </ul>
              <div className="mt-6">
                <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href="/premium-analysis">View Pricing & Upload</Link>
                </Button>
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background px-6 py-10 text-center sm:px-8">
          <h3 className="font-heading text-3xl font-bold text-foreground">
            Logistics Community & Focus Groups
          </h3>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
            Join discussions with other logistics professionals and participate in collaborative
            research and focus groups.
          </p>
          <div className="mt-6">
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/join-panel">Join Community</Link>
            </Button>
          </div>
        </section>
      </div>
    </AuthenticatedShell>
  )
}
