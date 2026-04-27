import { redirect } from 'next/navigation'

import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { createClient } from '@/lib/supabase/server'

export default async function MyBenchmarkPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AuthenticatedShell title="My Benchmark" subtitle="Track and compare your benchmark metrics.">
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This section is ready for your benchmark reports and comparisons.
        </p>
      </div>
    </AuthenticatedShell>
  )
}
