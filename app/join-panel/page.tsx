import { redirect } from 'next/navigation'

import { JoinPanelSection } from '@/app/components/join-panel/join-panel-section'
import { AuthenticatedShell } from '@/app/components/navigation/authenticated-shell'
import { createClient } from '@/lib/supabase/server'

export default async function JoinPanelPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AuthenticatedShell title="Join Panel" subtitle="Enroll in the LogiFacts panel experience.">
      <JoinPanelSection />
    </AuthenticatedShell>
  )
}
