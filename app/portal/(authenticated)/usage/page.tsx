import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { DashboardSkeleton } from './_components/skeleton'
import { PeriodSelector } from './_components/period-selector'
import { UsageDashboard } from './_components/usage-dashboard'

export const metadata = { title: 'Usage — LogiFacts Portal' }

const VALID_PERIODS = [7, 30, 90] as const
type Period = (typeof VALID_PERIODS)[number]

function parsePeriod(raw: string | string[] | undefined): Period {
  const n = Number(raw)
  return (VALID_PERIODS.includes(n as Period) ? n : 30) as Period
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  const params = await searchParams
  const period = parsePeriod(params.period)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API call volume, success rates, and carrier analytics.
          </p>
        </div>
        <PeriodSelector period={period} />
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <UsageDashboard customerId={ctx.customer_id} period={period} />
      </Suspense>
    </div>
  )
}
