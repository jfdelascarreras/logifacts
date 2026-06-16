import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { ShipmentQuoteForm } from '@/app/components/pricing/shipment-quote-form'
import { createClient } from '@/lib/supabase/server'

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const originZip = String(user.user_metadata?.origin_zip ?? '')

  return (
    <AuthenticatedShell
      title="LogiFacts Shipment Calculator"
      subtitle="Multi-carrier rate modeling · UPS & FedEx · 2026 published tariffs"
    >
      {!originZip && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-medium">Origin ZIP not configured.</span>{' '}
          Add your shipping origin in{' '}
          <a href="/protected" className="font-semibold underline underline-offset-2">
            My Profile
          </a>{' '}
          to prefill lane inputs.
        </div>
      )}
      <ShipmentQuoteForm defaultOriginZip={originZip} />
    </AuthenticatedShell>
  )
}
