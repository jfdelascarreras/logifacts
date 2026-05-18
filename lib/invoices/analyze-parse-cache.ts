/**
 * Short-lived in-memory cache of parsed invoice rows per user + upload fingerprint.
 * Speeds up repeated POST /api/invoices/analyze calls (e.g. filter tweaks) when CSVs unchanged.
 * Safe for serverless warm instances only — cold starts miss cache; TTL bounds memory.
 */
import type { InvoiceRecord } from './csv'

export type PremiumParseIngestDiagnostics = {
  duplicateUploadRowsSkipped: number
  duplicateChargeRowsDropped: number
  rowsDroppedCriticalSciCorruption: number
}

type CacheEntry = {
  fullRecords: InvoiceRecord[]
  profileCompanyName: string
  expiresAt: number
  ingestDiagnostics: PremiumParseIngestDiagnostics
}

const ZERO_INGEST: PremiumParseIngestDiagnostics = {
  duplicateUploadRowsSkipped: 0,
  duplicateChargeRowsDropped: 0,
  rowsDroppedCriticalSciCorruption: 0,
}

const cache = new Map<string, CacheEntry>()
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

export function getAnalyzeParseCache(
  key: string,
  profileCompanyName: string
): { fullRecords: InvoiceRecord[]; ingestDiagnostics: PremiumParseIngestDiagnostics } | null {
  pruneAnalyzeParseCache()
  const e = cache.get(key)
  if (!e || Date.now() > e.expiresAt) {
    if (e) cache.delete(key)
    return null
  }
  if (e.profileCompanyName !== profileCompanyName) {
    cache.delete(key)
    return null
  }
  return { fullRecords: e.fullRecords, ingestDiagnostics: e.ingestDiagnostics }
}

export function setAnalyzeParseCache(
  key: string,
  profileCompanyName: string,
  fullRecords: InvoiceRecord[],
  ingestDiagnostics?: PremiumParseIngestDiagnostics
): void {
  while (cache.size >= MAX_KEYS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  cache.set(key, {
    fullRecords,
    profileCompanyName,
    expiresAt: Date.now() + TTL_MS,
    ingestDiagnostics: ingestDiagnostics ? { ...ingestDiagnostics } : { ...ZERO_INGEST },
  })
}

function pruneAnalyzeParseCache(): void {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k)
  }
}
