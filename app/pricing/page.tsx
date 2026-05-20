import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { UPSQuoteForm } from '@/app/components/pricing/ups-quote-form'
import { createClient } from '@/lib/supabase/server'

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const originZip = String(user.user_metadata?.origin_zip ?? '')

  return (
    <AuthenticatedShell
      title="UPS Rate Estimator"
      subtitle="Contract D001207201 · Addendum B"
    >
      {!originZip && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          No origin ZIP set. Add your shipping origin ZIP in{' '}
          <a href="/protected" className="underline underline-offset-2">
            My Profile
          </a>{' '}
          to prefill this form, or enter it manually below.
        </div>
      )}
      <div className="max-w-2xl">
        <UPSQuoteForm defaultOriginZip={originZip} />
      </div>
    </AuthenticatedShell>
  )
}
