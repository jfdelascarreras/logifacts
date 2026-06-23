import { createClient } from '@/lib/supabase/server'

export type CustomerContext = {
  customer_id: string
  name: string
  key_prefix: string
  apiKeyId: string
  enforce_discounts: boolean
  default_dimensions: { length: number; width: number; height: number } | null
}

/**
 * Load the portal customer context for a given Supabase user ID.
 *
 * Returns null when the user has no customers row — the portal layout treats
 * this as "access not configured" and renders an error state instead of the
 * portal shell. Never pass customer_id from the client; always derive it here.
 */
export async function getCustomerContext(userId: string): Promise<CustomerContext | null> {
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('customer_id, name, enforce_discounts, default_dimensions')
    .eq('user_id', userId)
    .maybeSingle()

  if (!customer) return null

  // Get the most recently created active key — prefix for display, id for request logging.
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, key_prefix')
    .eq('customer_id', customer.customer_id)
    .eq('active', true)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    customer_id: customer.customer_id,
    name: customer.name ?? customer.customer_id,
    key_prefix: apiKey?.key_prefix ?? '',
    apiKeyId: apiKey?.id ?? '',
    enforce_discounts: customer.enforce_discounts,
    default_dimensions: customer.default_dimensions as CustomerContext['default_dimensions'],
  }
}
