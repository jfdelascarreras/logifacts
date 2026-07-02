import type { Redis } from '@upstash/redis'

const TTL_SECONDS = 300 // 5 minutes

function redisKey(customerId: string, idempotencyKey: string) {
  return `idem:${customerId}:${idempotencyKey}`
}

export async function getCachedIdempotentResponse(
  redis: Redis,
  customerId: string,
  idempotencyKey: string,
): Promise<string | null> {
  try {
    const cached = await redis.get<string>(redisKey(customerId, idempotencyKey))
    return cached ?? null
  } catch {
    return null
  }
}

export async function cacheIdempotentResponse(
  redis: Redis,
  customerId: string,
  idempotencyKey: string,
  body: unknown,
): Promise<void> {
  try {
    await redis.set(redisKey(customerId, idempotencyKey), JSON.stringify(body), { ex: TTL_SECONDS })
  } catch {
    // fail open — idempotency is best-effort when Redis is degraded
  }
}
