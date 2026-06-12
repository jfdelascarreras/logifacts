import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { CarrierIngestAdapter, CarrierIngestContext } from './types'
import { createMultipartIngestAdapter } from './multipart'
import { upsIngestAdapter } from './ups'
import { mergeCarrierIngestResults, type MergedIngestResult } from './merge'

export type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
export type { MergedIngestResult } from './merge'
export { mergeCarrierIngestResults } from './merge'
export { invoiceLinesToRecords } from './shared'

/** Registered adapters — one per carrier, each normalizing to `InvoiceRecord[]`. */
export const PREMIUM_INGEST_ADAPTERS: readonly CarrierIngestAdapter[] = [
  upsIngestAdapter,
  createMultipartIngestAdapter('FedEx'),
  createMultipartIngestAdapter('WWE'),
]

export async function loadPremiumIngestRecords(
  supabase: SupabaseClient,
  user: User
): Promise<MergedIngestResult> {
  const ctx: CarrierIngestContext = {
    supabase,
    user,
    profileCompanyName: String(user.user_metadata?.company_name ?? '').trim(),
  }

  const parts = await Promise.all(PREMIUM_INGEST_ADAPTERS.map((adapter) => adapter.load(ctx)))
  return mergeCarrierIngestResults(parts)
}
