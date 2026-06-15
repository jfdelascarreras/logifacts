/**
 * Short-lived cache of parsed UPS CSV rows per user + upload fingerprint.
 * L1: in-memory (warm serverless instances). L2: Redis (survives cold starts).
 */
import type { InvoiceRecord } from '@/lib/invoices/csv'
import type { UpsRowSyncInput } from '@/lib/invoices/invoice-rows'
import {
  getParseIngestCacheRedis,
  setParseIngestCacheRedis,
  type ParseIngestCacheEntry,
} from '@/lib/cache/parse-ingest-cache'

export type PremiumParseIngestDiagnostics = {
  duplicateUploadRowsSkipped: number
  duplicateChargeRowsDropped: number
  rowsDroppedCriticalSciCorruption: number
  linesTotal: number
  linesMapped: number
  unmappedSpend: number
  shipmentsTotal: number
  shipmentsWithoutTracking: number
  linesMissingShipDate: number
  parseVersions: string[]
}

type CacheEntry = ParseIngestCacheEntry & { expiresAt: number }

const ZERO_INGEST: PremiumParseIngestDiagnostics = {
  duplicateUploadRowsSkipped: 0,
  duplicateChargeRowsDropped: 0,
  rowsDroppedCriticalSciCorruption: 0,
  linesTotal: 0,
  linesMapped: 0,
  unmappedSpend: 0,
  shipmentsTotal: 0,
  shipmentsWithoutTracking: 0,
  linesMissingShipDate: 0,
  parseVersions: [],
}

const memoryCache = new Map<string, CacheEntry>()
const MAX_KEYS = 12
const TTL_MS = 4 * 60 * 1000

export function analyzeParseCacheFingerprint(
  uploads: ReadonlyArray<{ id: string; content_sha256?: string | null }>
): string {
  return [...uploads]
    .map((u) => `${u.id}:${String(u.content_sha256 ?? '').trim()}`)
    .sort()
    .join('\n')
}

export function analyzeParseCacheKey(userId: string, fingerprint: string): string {
  return `${userId}::${fingerprint}`
}

function pruneMemoryCache(): void {
  const now = Date.now()
  for (const [k, v] of memoryCache) {
    if (now > v.expiresAt) memoryCache.delete(k)
  }
}

function readMemoryCache(key: string, profileCompanyName: string) {
  pruneMemoryCache()
  const e = memoryCache.get(key)
  if (!e || Date.now() > e.expiresAt) {
    if (e) memoryCache.delete(key)
    return null
  }
  if (e.profileCompanyName !== profileCompanyName) {
    memoryCache.delete(key)
    return null
  }
  return e
}

function writeMemoryCache(key: string, entry: ParseIngestCacheEntry): void {
  while (memoryCache.size >= MAX_KEYS) {
    const oldest = memoryCache.keys().next().value
    if (oldest === undefined) break
    memoryCache.delete(oldest)
  }
  memoryCache.set(key, { ...entry, expiresAt: Date.now() + TTL_MS })
}

/** Sync L1 read — retained for unit tests. */
export function getAnalyzeParseCache(
  key: string,
  profileCompanyName: string
): {
  fullRecords: InvoiceRecord[]
  upsSyncTagged: UpsRowSyncInput[]
  ingestDiagnostics: PremiumParseIngestDiagnostics
} | null {
  const e = readMemoryCache(key, profileCompanyName)
  if (!e) return null
  return {
    fullRecords: e.fullRecords,
    upsSyncTagged: e.upsSyncTagged ?? [],
    ingestDiagnostics: e.ingestDiagnostics,
  }
}

/** L1 + L2 read for production ingest adapters. */
export async function getAnalyzeParseCacheAsync(
  key: string,
  profileCompanyName: string
): Promise<{
  fullRecords: InvoiceRecord[]
  upsSyncTagged: UpsRowSyncInput[]
  ingestDiagnostics: PremiumParseIngestDiagnostics
} | null> {
  const mem = readMemoryCache(key, profileCompanyName)
  if (mem) {
    return {
      fullRecords: mem.fullRecords,
      upsSyncTagged: mem.upsSyncTagged ?? [],
      ingestDiagnostics: mem.ingestDiagnostics,
    }
  }

  const remote = await getParseIngestCacheRedis(key)
  if (!remote || remote.profileCompanyName !== profileCompanyName) return null

  writeMemoryCache(key, remote)
  return {
    fullRecords: remote.fullRecords,
    upsSyncTagged: remote.upsSyncTagged ?? [],
    ingestDiagnostics: remote.ingestDiagnostics,
  }
}

/** Sync L1 write — retained for unit tests. */
export function setAnalyzeParseCache(
  key: string,
  profileCompanyName: string,
  fullRecords: InvoiceRecord[],
  ingestDiagnostics?: PremiumParseIngestDiagnostics,
  upsSyncTagged: UpsRowSyncInput[] = []
): void {
  writeMemoryCache(key, {
    fullRecords,
    upsSyncTagged,
    profileCompanyName,
    ingestDiagnostics: ingestDiagnostics ? { ...ingestDiagnostics } : { ...ZERO_INGEST },
  })
}

/** L1 + L2 write for production ingest adapters. */
export async function setAnalyzeParseCacheAsync(
  key: string,
  profileCompanyName: string,
  fullRecords: InvoiceRecord[],
  ingestDiagnostics?: PremiumParseIngestDiagnostics,
  upsSyncTagged: UpsRowSyncInput[] = []
): Promise<void> {
  const entry: ParseIngestCacheEntry = {
    fullRecords,
    upsSyncTagged,
    profileCompanyName,
    ingestDiagnostics: ingestDiagnostics ? { ...ingestDiagnostics } : { ...ZERO_INGEST },
  }
  writeMemoryCache(key, entry)
  await setParseIngestCacheRedis(key, entry)
}
