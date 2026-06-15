import type { SupabaseClient, User } from '@supabase/supabase-js'

import { bootstrapInvoiceRowsIfEmpty } from '@/lib/premium-analysis/invoice-rows-bootstrap'
import { shadowCompareIngestTotals } from '@/lib/premium-analysis/ingest-quality'

import type { CarrierIngestAdapter, CarrierIngestContext } from './types'
import { createMultipartIngestAdapter } from './multipart'
import {
  countInvoiceRowSources,
  fetchInvoiceRowsForUser,
  invoiceRowRecordsToInvoiceRecords,
  parseVersionsFromInvoiceRows,
} from './invoice-rows'
import { upsIngestAdapter } from './ups'
import { mergeCarrierIngestResults, type MergedIngestResult } from './merge'
import { ZERO_INGEST_DIAGNOSTICS } from './types'

export type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
export type { MergedIngestResult } from './merge'
export { mergeCarrierIngestResults } from './merge'
export { invoiceLinesToRecords } from './shared'
export {
  fetchInvoiceRowsForUser,
  invoiceRowRecordsToInvoiceRecords,
  type RawInvoiceRow,
} from './invoice-rows'

export type PremiumIngestSource = 'auto' | 'invoice_rows' | 'legacy'

export const LEGACY_INGEST_DEPRECATION =
  'Legacy ingest adapters (invoices/invoice_lines, invoice_uploads CSV read path) are deprecated. ' +
  'Analysis now reads invoice_rows by default. Set PREMIUM_INGEST_SOURCE=legacy only for emergency rollback.'

/**
 * @deprecated S6 — use `loadPremiumIngestRecords` with default `invoice_rows` source.
 * Retained for `PREMIUM_INGEST_SOURCE=legacy|auto` rollback only.
 */
export const PREMIUM_INGEST_ADAPTERS: readonly CarrierIngestAdapter[] = [
  upsIngestAdapter,
  createMultipartIngestAdapter('FedEx'),
  createMultipartIngestAdapter('WWE'),
]

export function resolvePremiumIngestSource(): PremiumIngestSource {
  const raw = (process.env.PREMIUM_INGEST_SOURCE ?? 'invoice_rows').trim().toLowerCase()
  if (raw === 'auto' || raw === 'legacy') return raw
  return 'invoice_rows'
}

function warnDeprecatedIngest(mode: PremiumIngestSource): void {
  console.warn(`[ingest] PREMIUM_INGEST_SOURCE=${mode} — ${LEGACY_INGEST_DEPRECATION}`)
}

async function loadLegacyIngestRecords(
  supabase: SupabaseClient,
  user: User
): Promise<MergedIngestResult> {
  warnDeprecatedIngest('legacy')
  const ctx: CarrierIngestContext = {
    supabase,
    user,
    profileCompanyName: String(user.user_metadata?.company_name ?? '').trim(),
  }
  const parts = await Promise.all(PREMIUM_INGEST_ADAPTERS.map((adapter) => adapter.load(ctx)))
  return { ...mergeCarrierIngestResults(parts), ingestSource: 'legacy' }
}

async function loadInvoiceRowsIngest(
  supabase: SupabaseClient,
  user: User
): Promise<MergedIngestResult> {
  const rows = await fetchInvoiceRowsForUser(supabase, user.id)
  const records = invoiceRowRecordsToInvoiceRecords(rows)
  return {
    records,
    sourceCount: countInvoiceRowSources(rows) || (records.length > 0 ? 1 : 0),
    diagnostics: {
      ...ZERO_INGEST_DIAGNOSTICS,
      parseVersions: parseVersionsFromInvoiceRows(rows),
    },
    upsSyncTagged: [],
    ingestSource: 'invoice_rows',
  }
}

async function loadInvoiceRowsWithBootstrap(
  supabase: SupabaseClient,
  user: User
): Promise<MergedIngestResult> {
  let facts = await loadInvoiceRowsIngest(supabase, user)
  if (facts.records.length > 0) return facts

  await bootstrapInvoiceRowsIfEmpty(supabase, user)
  facts = await loadInvoiceRowsIngest(supabase, user)
  if (facts.records.length === 0) {
    throw new Error(
      'No invoice_rows data found. Upload invoices on this page, then click Refresh analysis. ' +
        'For emergency rollback, set PREMIUM_INGEST_SOURCE=legacy.'
    )
  }
  return facts
}

export async function loadPremiumIngestRecords(
  supabase: SupabaseClient,
  user: User
): Promise<MergedIngestResult> {
  const source = resolvePremiumIngestSource()

  if (source === 'legacy') {
    return loadLegacyIngestRecords(supabase, user)
  }

  if (source === 'invoice_rows') {
    return loadInvoiceRowsWithBootstrap(supabase, user)
  }

  // auto: shadow parity check before cutover (deprecated — prefer invoice_rows)
  warnDeprecatedIngest('auto')
  const facts = await loadInvoiceRowsWithBootstrap(supabase, user)
  if (facts.records.length === 0) {
    return loadLegacyIngestRecords(supabase, user)
  }

  const legacy = await loadLegacyIngestRecords(supabase, user)
  const shadow = shadowCompareIngestTotals(facts.records, legacy.records)

  if (legacy.records.length === 0 || shadow.ok) {
    return facts
  }

  console.warn(
    '[ingest] auto mode: shadow parity failed — falling back to legacy adapters',
    { deltaPct: `${(shadow.deltaPct * 100).toFixed(3)}%` }
  )
  return legacy
}
