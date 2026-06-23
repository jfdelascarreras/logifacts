import { createClient } from '@/lib/supabase/server'

export type AdminContext = {
  userId: string
  email: string
}

/**
 * Returns the admin context for the current session, or null if the user is
 * not authenticated or their email is not in ADMIN_EMAILS.
 *
 * Set ADMIN_EMAILS in .env.local as a comma-separated list:
 *   ADMIN_EMAILS=alice@logifacts.com,bob@logifacts.com
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return null

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (!adminEmails.includes(user.email.toLowerCase())) return null

  return { userId: user.id, email: user.email }
}
