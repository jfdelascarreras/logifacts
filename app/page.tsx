import { LandingHero } from '@/app-components/landing'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const metadata = user?.user_metadata ?? {}

  return (
    <LandingHero
      initialFullName={String(metadata.full_name ?? metadata.fullName ?? '').trim()}
      initialCompanyName={String(metadata.company_name ?? '').trim()}
      initialEmail={user?.email?.trim() ?? ''}
      isSignedIn={Boolean(user)}
    />
  )
}
