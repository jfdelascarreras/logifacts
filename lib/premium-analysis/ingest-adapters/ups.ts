import type { CarrierIngestAdapter, CarrierIngestContext, CarrierIngestResult } from './types'
import { createMultipartIngestAdapter } from './multipart'
import { upsCsvIngestAdapter } from './ups-csv'

const upsMultipartAdapter = createMultipartIngestAdapter('UPS')

/**
 * UPS adapter: `invoice_uploads` CSV (legacy) or `invoices`/`invoice_lines` (upload panel).
 * When both exist, uses whichever source was updated most recently — avoids stale CSV
 * blocking newer multipart UPS files (or vice versa). Never merges both (no double-count).
 */
export const upsIngestAdapter: CarrierIngestAdapter = {
  carrier: 'UPS',
  async load(ctx: CarrierIngestContext): Promise<CarrierIngestResult | null> {
    const [{ data: latestCsv }, { data: latestMultipart }] = await Promise.all([
      ctx.supabase
        .from('invoice_uploads')
        .select('created_at')
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from('invoices')
        .select('created_at')
        .eq('user_id', ctx.user.id)
        .eq('carrier', 'UPS')
        .eq('upload_status', 'processed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const csvTime = latestCsv?.created_at ? Date.parse(latestCsv.created_at) : 0
    const mpTime = latestMultipart?.created_at ? Date.parse(latestMultipart.created_at) : 0

    const preferCsv = csvTime > 0 && (mpTime === 0 || csvTime >= mpTime)
    const preferMultipart = mpTime > 0 && (csvTime === 0 || mpTime > csvTime)

    if (preferCsv) {
      const csvResult = await upsCsvIngestAdapter.load(ctx)
      if (csvResult?.records.length) return csvResult
    }

    if (preferMultipart || csvTime > 0) {
      const mpResult = await upsMultipartAdapter.load(ctx)
      if (mpResult?.records.length) return mpResult
    }

    if (preferCsv) return upsCsvIngestAdapter.load(ctx)
    return upsMultipartAdapter.load(ctx)
  },
}
