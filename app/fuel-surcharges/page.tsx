import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { FuelSurchargeHub } from '@/app/components/fuel-surcharges/fuel-surcharge-hub'
import { createClient } from '@/lib/supabase/server'

export default async function FuelSurchargesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  return (
    <AuthenticatedShell
      title="Fuel Surcharges"
      subtitle="Live carrier rates · Contract overlay · Invoice re-rating"
    >
      <FuelSurchargeHub />
    </AuthenticatedShell>
  )
}
