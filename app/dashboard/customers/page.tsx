import { redirect } from 'next/navigation'

import { AuthSidebar } from '@/app/components/navigation/auth-sidebar'
import { getAdminContext } from '@/lib/admin/getAdminContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { CustomersShell, type CustomerRow } from './_components/customers-shell'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const admin = await getAdminContext()
  if (!admin) redirect('/home')

  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 4 parallel queries — admin client bypasses RLS.
  const [customersRes, keysRes, discountsRes, requestsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('customer_id, name, user_id, enforce_discounts, created_at')
      .order('created_at', { ascending: false }),

    supabase
      .from('api_keys')
      .select('customer_id, key_prefix, last_used_at, active')
      .eq('active', true)
      .order('created_at', { ascending: false }),

    supabase
      .from('user_contract_discounts')
      .select('user_id'),

    supabase
      .from('rate_requests')
      .select('customer_id, created_at')
      .gte('created_at', thirtyDaysAgo),
  ])

  const customers = customersRes.data ?? []
  const activeKeys = keysRes.data ?? []
  const discountUserIds = new Set((discountsRes.data ?? []).map((d) => d.user_id as string))

  // Aggregate rate_requests in JS — group by customer_id.
  const requestMap = new Map<string, { count: number; lastActive: string }>()
  for (const row of requestsRes.data ?? []) {
    const cid = row.customer_id as string
    const existing = requestMap.get(cid)
    if (!existing) {
      requestMap.set(cid, { count: 1, lastActive: row.created_at as string })
    } else {
      existing.count++
      if ((row.created_at as string) > existing.lastActive) {
        existing.lastActive = row.created_at as string
      }
    }
  }

  // Build a map of customer_id → most-recent active key (already ordered by created_at DESC).
  const keyMap = new Map<string, { key_prefix: string; last_used_at: string | null }>()
  for (const key of activeKeys) {
    if (!keyMap.has(key.customer_id as string)) {
      keyMap.set(key.customer_id as string, {
        key_prefix: key.key_prefix as string,
        last_used_at: (key.last_used_at as string | null) ?? null,
      })
    }
  }

  const rows: CustomerRow[] = customers.map((c) => {
    const key = keyMap.get(c.customer_id as string) ?? null
    const requests = requestMap.get(c.customer_id as string) ?? null
    const hasActiveKey = key !== null
    const hasDiscounts = discountUserIds.has(c.user_id as string)
    const recentRequestCount = requests?.count ?? 0

    return {
      customer_id: c.customer_id as string,
      name: (c.name as string | null) ?? null,
      user_id: c.user_id as string,
      enforce_discounts: Boolean(c.enforce_discounts),
      created_at: c.created_at as string,
      keyPrefix: key?.key_prefix ?? null,
      keyLastUsed: key?.last_used_at ?? null,
      hasActiveKey,
      lastActive: requests?.lastActive ?? null,
      recentRequestCount,
      hasDiscounts,
      isReady: hasActiveKey && hasDiscounts && recentRequestCount > 0,
    }
  })

  return (
    <div className="min-h-svh bg-background md:flex">
      <AuthSidebar />
      <main className="flex-1 p-6 md:p-8">
        <CustomersShell customers={rows} />
      </main>
    </div>
  )
}
