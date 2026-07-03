import { describe, expect, it } from 'vitest'
import { createExplainCache, createRateLimiter, explainCacheKey } from './explain-cache'

describe('explainCacheKey', () => {
  it('is distinct per slug, data vintage, and model', () => {
    const a = explainCacheKey('omega', '2026-07-03T19:55:25Z', 'claude-opus-4-8')
    expect(a).toBe('omega|2026-07-03T19:55:25Z|claude-opus-4-8')
    expect(a).not.toBe(explainCacheKey('omega', '2026-07-04T00:00:00Z', 'claude-opus-4-8'))
    expect(a).not.toBe(explainCacheKey('omega', '2026-07-03T19:55:25Z', 'other-model'))
  })
})

describe('createExplainCache', () => {
  const value = { explanation: 'text', model: 'm', ranAt: 't' }

  it('round-trips within the TTL and expires after it', () => {
    const cache = createExplainCache({ ttlMs: 1000 })
    cache.set('k', value, 0)
    expect(cache.get('k', 500)?.explanation).toBe('text')
    expect(cache.get('k', 1500)).toBeNull()
  })

  it('evicts the oldest entry at maxSize', () => {
    const cache = createExplainCache({ maxSize: 2 })
    cache.set('a', value, 0)
    cache.set('b', value, 1)
    cache.set('c', value, 2) // evicts 'a'
    expect(cache.get('a', 3)).toBeNull()
    expect(cache.get('b', 3)).not.toBeNull()
    expect(cache.get('c', 3)).not.toBeNull()
  })
})

describe('createRateLimiter', () => {
  it('allows the per-IP limit then blocks with a sane retry hint', () => {
    const limiter = createRateLimiter({ perIpLimit: 5, globalLimit: 100, windowMs: 60_000 })
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('1.2.3.4', i * 1000)).toEqual({ allowed: true })
    }
    const blocked = limiter.check('1.2.3.4', 5000)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('recovers after the window slides past', () => {
    const limiter = createRateLimiter({ perIpLimit: 2, globalLimit: 100, windowMs: 10_000 })
    limiter.check('ip', 0)
    limiter.check('ip', 1)
    expect(limiter.check('ip', 2).allowed).toBe(false)
    expect(limiter.check('ip', 10_500).allowed).toBe(true) // both slid out
  })

  it('isolates IPs from each other', () => {
    const limiter = createRateLimiter({ perIpLimit: 1, globalLimit: 100, windowMs: 60_000 })
    limiter.check('a', 0)
    expect(limiter.check('a', 1).allowed).toBe(false)
    expect(limiter.check('b', 1).allowed).toBe(true)
  })

  it('trips the global cap across distinct IPs', () => {
    const limiter = createRateLimiter({ perIpLimit: 10, globalLimit: 3, windowMs: 60_000 })
    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('b', 1).allowed).toBe(true)
    expect(limiter.check('c', 2).allowed).toBe(true)
    expect(limiter.check('d', 3).allowed).toBe(false)
  })
})
