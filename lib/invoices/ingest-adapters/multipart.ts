import type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
import { ZERO_INGEST_DIAGNOSTICS } from './types'
import { fetchInvoiceLines, fetchProcessedInvoiceMeta, invoiceLinesToRecords } from './shared'
import type { Carrier } from '@/types/invoice'

/** Multipart ingest (`invoices` + `invoice_lines`) for a single carrier. */
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
      if (lines.length === 0) return null

      return {
        carrier,
        records: invoiceLinesToRecords(lines, invoices),
        sourceCount: invoices.length,
        diagnostics: { ...ZERO_INGEST_DIAGNOSTICS },
      }
    },
  }
}
