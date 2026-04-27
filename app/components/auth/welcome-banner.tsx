import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

function displayNameFromUser(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const full =
    typeof meta?.full_name === 'string' ? meta.full_name.trim() : ''
  const name = typeof meta?.name === 'string' ? meta.name.trim() : ''
  if (full) return full
  if (name) return name
  if (user.email) {
    const local = user.email.split('@')[0]
    if (local) return local
  }
  return 'there'
}

interface WelcomeBannerProps {
  className?: string
}

export async function WelcomeBanner({ className }: WelcomeBannerProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const name = displayNameFromUser(user)

  return (
    <p className={cn('font-heading text-lg font-bold tracking-wide', className)}>
      Welcome {name} to Logifacts
    </p>
  )
}
