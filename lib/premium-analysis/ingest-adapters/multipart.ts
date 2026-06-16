import { FEDEX_PARSE_VERSION } from '@/lib/invoices/charge-line-contract'
import type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'
import { fetchInvoiceLines, fetchProcessedInvoiceMeta, invoiceLinesToRecords } from './shared'
import type { Carrier } from '@/types/invoice'

const PARSE_VERSION_BY_CARRIER: Partial<Record<Carrier, string>> = {
  FedEx: FEDEX_PARSE_VERSION,
}

/** @deprecated S6 — use invoice_rows read path. Retained for PREMIUM_INGEST_SOURCE=legacy rollback. */
export function createMultipartIngestAdapter(carrier: Carrier): CarrierIngestAdapter {
  return {
    carrier,
    async load(ctx: CarrierIngestContext): Promise<CarrierIngestResult | null> {
      const invoices = await fetchProcessedInvoiceMeta(ctx.supabase, ctx.user.id, [carrier])
      if (invoices.length === 0) return null

      const lines = await fetchInvoiceLines(
        ctx.supabase,
        invoices.map((i) => i.id)
      )
      if (lines.length === 0) {
        throw new Error(
          `Found ${invoices.length} processed ${carrier} invoice(s) but no charge lines were loaded. Try re-uploading the file.`
        )
      }

      return {
        carrier,
        records: invoiceLinesToRecords(lines, invoices),
        sourceCount: invoices.length,
        diagnostics: {
          ...ZERO_INGEST_DIAGNOSTICS,
          parseVersions: PARSE_VERSION_BY_CARRIER[carrier]
            ? [PARSE_VERSION_BY_CARRIER[carrier]!]
            : [],
        },
      }
    },
  }
}
