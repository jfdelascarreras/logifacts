import type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
import { createMultipartIngestAdapter } from './multipart'
import { upsCsvIngestAdapter } from './ups-csv'

const upsMultipartAdapter = createMultipartIngestAdapter('UPS')

/**
 * UPS adapter: prefer full CSV in `invoice_uploads` when present (legacy path).
 * Otherwise read multipart UPS rows from `invoices` / `invoice_lines` (upload panel path).
 * Never merges both — avoids double-counting when a user has used both ingest paths.
 */
export const upsIngestAdapter: CarrierIngestAdapter = {
  carrier: 'UPS',
  async load(ctx: CarrierIngestContext): Promise<CarrierIngestResult | null> {
    const csvResult = await upsCsvIngestAdapter.load(ctx)
    if (csvResult && csvResult.records.length > 0) return csvResult
    return upsMultipartAdapter.load(ctx)
  },
}
