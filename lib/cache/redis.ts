import { Redis } from '@upstash/redis'

/**
 * Returns a Redis client if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * are configured, otherwise returns null. Callers must handle null gracefully
 * so the app works without Redis during local development.
 */
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const redis: Redis | null = createRedisClient()
