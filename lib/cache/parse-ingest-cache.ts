import type { PremiumParseIngestDiagnostics } from '@/lib/premium-analysis/analyze-parse-cache'
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'

import { redis } from './redis'

const CACHE_TTL_SECONDS = 4 * 60 // match in-memory TTL (4 minutes)

export type ParseIngestCacheEntry = {
  fullRecords: InvoiceRecord[]
  upsSyncTagged: UpsRowSyncInput[]
  profileCompanyName: string
  ingestDiagnostics: PremiumParseIngestDiagnostics
}

function redisKey(cacheKey: string): string {
  return `parse_ingest:${cacheKey}`
}

export async function getParseIngestCacheRedis(
  cacheKey: string
): Promise<ParseIngestCacheEntry | null> {
  if (!redis) return null
  try {
    return await redis.get<ParseIngestCacheEntry>(redisKey(cacheKey))
  } catch {
    return null
  }
}

export async function setParseIngestCacheRedis(
  cacheKey: string,
  entry: ParseIngestCacheEntry
): Promise<void> {
  if (!redis) return
  try {
    await redis.set(redisKey(cacheKey), entry, { ex: CACHE_TTL_SECONDS })
  } catch {
    // non-fatal
  }
}

/** Drop all parse-ingest keys for a user (UPS CSV fingerprint keys are user-prefixed). */
export async function invalidateParseIngestCacheForUser(userId: string): Promise<void> {
  if (!redis) return
  try {
    const pattern = `parse_ingest:${userId}::*`
    let cursor = 0
    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 })
      cursor = Number(result[0])
      const keys = result[1] as string[]
      if (keys.length) await redis.del(...keys)
    } while (cursor !== 0)
  } catch {
    // non-fatal
  }
}
