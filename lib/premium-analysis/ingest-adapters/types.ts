import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'
import { emptyIngestDiagnostics } from '@/lib/premium-analysis/ingest-diagnostics'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'
import type { Carrier } from '@/types/invoice'

/** Result of one carrier adapter normalizing stored ingest data → charge lines. */
export type CarrierIngestResult = {
  carrier: Carrier
  records: InvoiceRecord[]
  /** Distinct source files ingested (deduped uploads or processed invoice headers). */
  sourceCount: number
  diagnostics: PremiumParseIngestDiagnostics
  /** UPS CSV uploads only — used for `invoice_rows` sync on unfiltered analyze. */
  upsSyncTagged?: UpsRowSyncInput[]
}

export type CarrierIngestContext = {
  supabase: SupabaseClient
  user: User
  profileCompanyName: string
}

/** Loads one carrier's charge lines from whatever storage backend that carrier uses. */
export type CarrierIngestAdapter = {
  readonly carrier: Carrier
  load(ctx: CarrierIngestContext): Promise<CarrierIngestResult | null>
}

export const ZERO_INGEST_DIAGNOSTICS: PremiumParseIngestDiagnostics = emptyIngestDiagnostics()
