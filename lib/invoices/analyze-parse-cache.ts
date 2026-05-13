/**
 * Short-lived in-memory cache of parsed invoice rows per user + upload fingerprint.
 * Speeds up repeated POST /api/invoices/analyze calls (e.g. filter tweaks) when CSVs unchanged.
 * Safe for serverless warm instances only — cold starts miss cache; TTL bounds memory.
 */
import type { InvoiceRecord } from './csv'

type CacheEntry = {
  fullRecords: InvoiceRecord[]
  profileCompanyName: string
  expiresAt: number
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

export function getAnalyzeParseCache(key: string, profileCompanyName: string): InvoiceRecord[] | null {
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
  return e.fullRecords
}

export function setAnalyzeParseCache(
  key: string,
  profileCompanyName: string,
  fullRecords: InvoiceRecord[]
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
  })
}

function pruneAnalyzeParseCache(): void {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k)
  }
}
