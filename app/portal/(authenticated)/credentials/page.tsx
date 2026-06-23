import { redirect } from 'next/navigation'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'
import { CredentialsDisplay } from './_components/credentials-display'
import { KeyHistoryTable, type ApiKeyRow } from './_components/key-history-table'
import { RegenerateFlow } from './_components/regenerate-flow'

export const metadata = { title: 'API Credentials — LogiFacts Portal' }

export default async function CredentialsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const ctx = await getCustomerContext(user.id)
  if (!ctx) redirect('/portal/login')

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id, key_prefix, active, created_at, last_used_at, revoked_at, revoked_reason')
    .eq('customer_id', ctx.customer_id)
    .order('created_at', { ascending: false })

  const typedKeys = (keys ?? []) as ApiKeyRow[]
  const activeKey = typedKeys.find((k) => k.active) ?? null

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">API Credentials</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your API key and view usage history.
        </p>
      </div>

      <CredentialsDisplay
        customerId={ctx.customer_id}
        keyPrefix={activeKey?.key_prefix ?? null}
        isActive={!!activeKey}
        lastUsedAt={activeKey?.last_used_at ?? null}
      />

      <div className="border-t border-border pt-6">
        <RegenerateFlow />
      </div>

      {typedKeys.length > 0 && (
        <div className="border-t border-border pt-6">
          <KeyHistoryTable keys={typedKeys} />
        </div>
      )}
    </div>
  )
}
