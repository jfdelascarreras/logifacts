import { redis } from './redis'

const CACHE_TTL_SECONDS = 3600 // 1 hour

function cacheKey(userId: string): string {
  return `analysis:${userId}`
}

export async function getAnalysisCache(userId: string): Promise<unknown | null> {
  if (!redis) return null
  try {
    return await redis.get(cacheKey(userId))
  } catch {
    return null
  }
}

export async function setAnalysisCache(userId: string, data: unknown): Promise<void> {
  if (!redis) return
  try {
    await redis.set(cacheKey(userId), data, { ex: CACHE_TTL_SECONDS })
  } catch {
    // non-fatal
  }
}

export async function invalidateAnalysisCache(userId: string): Promise<void> {
  if (!redis) return
  try {
    await redis.del(cacheKey(userId))
  } catch {
    // non-fatal
  }
}
