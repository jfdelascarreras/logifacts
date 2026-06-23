import { redirect } from 'next/navigation'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { PortalShell } from './_components/portal-shell'

export default async function PortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)

  if (!ctx) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold text-foreground">Access not configured</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t linked to a portal yet. Contact{' '}
            <a
              href="mailto:support@logifacts.com"
              className="text-accent underline-offset-4 hover:underline"
            >
              support@logifacts.com
            </a>{' '}
            to get access.
          </p>
        </div>
      </div>
    )
  }

  return <PortalShell customerName={ctx.name}>{children}</PortalShell>
}
