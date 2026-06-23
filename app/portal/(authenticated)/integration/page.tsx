import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLinkIcon } from 'lucide-react'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { CodeExamples } from './_components/code-examples'
import { EndpointsTable } from './_components/endpoints-table'
import { ErrorReference } from './_components/error-reference'
import { PostmanDownloadButton } from './_components/postman-download-button'
import { QuickStartStepper } from './_components/quick-start-stepper'
import { RetryDecisionTree } from './_components/retry-decision-tree'

export const metadata = { title: 'Integration Hub — LogiFacts Portal' }

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-foreground">{children}</h2>
  )
}

export default async function IntegrationPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  const maskedPrefix = ctx.key_prefix ? `lf_${'•'.repeat(8)}` : 'not configured'

  return (
    <div className="max-w-3xl space-y-12">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integration Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you need to integrate the LogiFacts Rate Calculator API.
        </p>
      </div>

      {/* Section 1 — Quick Start */}
      <section className="space-y-4">
        <SectionHeading>Quick Start</SectionHeading>
        <QuickStartStepper />
      </section>

      {/* Section 2 — Credentials */}
      <section className="space-y-4">
        <SectionHeading>Your Credentials</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Use these values in every API request. Get your full API key from the{' '}
          <Link href="/portal/credentials" className="text-accent underline-offset-4 hover:underline">
            Credentials page
          </Link>
          .
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-zinc-950">
          <pre className="p-5 text-sm leading-relaxed text-zinc-100">
            <code>{`{
  "customer_id": "${ctx.customer_id}",
  "api_key":     "${maskedPrefix}"   // replace with your full key
}`}</code>
          </pre>
        </div>
      </section>

      {/* Section 3 — Code Examples */}
      <section className="space-y-4">
        <SectionHeading>Code Examples</SectionHeading>
        <CodeExamples customerId={ctx.customer_id} />
      </section>

      {/* Section 4 — Downloads */}
      <section className="space-y-4">
        <SectionHeading>Downloads</SectionHeading>
        <div className="flex flex-wrap items-center gap-4">
          <PostmanDownloadButton />
          <a
            href="https://docs.logifacts.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
          >
            API Documentation
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          The Postman collection is pre-filled with your Customer ID. Set{' '}
          <span className="font-mono">LOGIFACTS_API_KEY</span> to your full API key in Postman
          variables.
        </p>
      </section>

      {/* Section 5 — Endpoints */}
      <section className="space-y-4">
        <SectionHeading>Endpoints</SectionHeading>
        <EndpointsTable />
      </section>

      {/* Section 6 — Error Reference */}
      <section className="space-y-4">
        <SectionHeading>Error Reference</SectionHeading>
        <ErrorReference />
      </section>

      {/* Section 7 — Retry Logic */}
      <section className="space-y-4">
        <SectionHeading>Retry Strategy</SectionHeading>
        <RetryDecisionTree />
      </section>
    </div>
  )
}
