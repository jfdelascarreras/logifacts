import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { PortalLoginForm } from './_components/portal-login-form'

export const metadata = { title: 'Partner Portal — LogiFacts' }

export default async function PortalLoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Already logged in → send them straight to the portal
  if (user) redirect('/portal/calculator')

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PortalLoginForm />
      </div>
    </div>
  )
}
