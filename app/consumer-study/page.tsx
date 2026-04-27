import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { createClient } from '@/lib/supabase/server'

export default async function ConsumerStudyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AuthenticatedShell title="Consumer Study" subtitle="Review consumer-focused research and outcomes.">
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This section is ready for your consumer study dashboards and insights.
        </p>
      </div>
    </AuthenticatedShell>
  )
}
