import { describe, expect, it } from 'vitest'

import {
  analyzeParseCacheFingerprint,
  analyzeParseCacheKey,
  getAnalyzeParseCache,
  setAnalyzeParseCache,
} from './analyze-parse-cache'

describe('analyze-parse-cache', () => {
  it('fingerprint is stable for id order', () => {
    const a = analyzeParseCacheFingerprint([
      { id: 'b', content_sha256: '2' },
      { id: 'a', content_sha256: '1' },
    ])
    const b = analyzeParseCacheFingerprint([
      { id: 'a', content_sha256: '1' },
      { id: 'b', content_sha256: '2' },
    ])
    expect(a).toBe(b)
    expect(a).toContain('a:1')
    expect(a).toContain('b:2')
  })

  it('round-trips cache for same profile', () => {
    const key = analyzeParseCacheKey('user-1', 'a:1\nb:2')
    setAnalyzeParseCache(key, 'Acme', [])
    expect(getAnalyzeParseCache(key, 'Acme')).toEqual([])
    expect(getAnalyzeParseCache(key, 'Other')).toBeNull()
  })
})
