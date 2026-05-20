import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

/**
 * Service-role Supabase client for trusted server operations (e.g. account deletion).
 * Never import this from client components.
 */
export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    ''

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase service role configuration (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY).'
    )
  }

  adminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
