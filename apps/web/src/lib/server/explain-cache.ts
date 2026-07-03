/**
 * In-memory cache + rate limiter for the AI explainer route.
 *
 * SINGLE-PROCESS ASSUMPTION: both stores live in module memory. The deploy
 * target is one Fly.io machine; a second instance would need a shared store
 * (out of scope for the hackathon, documented here on purpose). Next.js dev
 * hot-reload re-instantiates the module and empties both — acceptable.
 */

export interface CachedExplanation {
  explanation: string
  model: string
  ranAt: string
  createdAt: number
}

/** Data-state keyed: a fresh `pnpm ev:run` changes ran_at and naturally invalidates. */
export function explainCacheKey(slug: string, ranAt: string, model: string): string {
  return `${slug}|${ranAt}|${model}`
}

export function createExplainCache(opts: { ttlMs?: number; maxSize?: number } = {}) {
  const ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000
  const maxSize = opts.maxSize ?? 50
  const store = new Map<string, CachedExplanation>()
  return {
    get(key: string, now: number = Date.now()): CachedExplanation | null {
      const hit = store.get(key)
      if (hit === undefined) return null
      if (now - hit.createdAt > ttlMs) {
        store.delete(key)
        return null
      }
      return hit
    },
    set(key: string, value: Omit<CachedExplanation, 'createdAt'>, now: number = Date.now()): void {
      if (store.size >= maxSize && !store.has(key)) {
        const oldest = store.keys().next().value
        if (oldest !== undefined) store.delete(oldest)
      }
      store.set(key, { ...value, createdAt: now })
    },
  }
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Sliding-window limiter: per-IP plus a global cap (the global cap protects
 * the API key on a public URL even against distributed clients).
 */
export function createRateLimiter(
  opts: { perIpLimit?: number; globalLimit?: number; windowMs?: number; maxIps?: number } = {},
) {
  const perIpLimit = opts.perIpLimit ?? 5
  const globalLimit = opts.globalLimit ?? 30
  const windowMs = opts.windowMs ?? 60_000
  const maxIps = opts.maxIps ?? 500
  const byIp = new Map<string, number[]>()
  let global: number[] = []

  const retryAfter = (oldest: number | undefined, now: number): number =>
    Math.max(1, Math.ceil((windowMs - (now - (oldest ?? now))) / 1000))

  return {
    check(ip: string, now: number = Date.now()): RateLimitResult {
      const cutoff = now - windowMs
      global = global.filter((t) => t > cutoff)
      const bucket = (byIp.get(ip) ?? []).filter((t) => t > cutoff)

      if (bucket.length >= perIpLimit) {
        byIp.set(ip, bucket)
        return { allowed: false, retryAfterSeconds: retryAfter(bucket[0], now) }
      }
      if (global.length >= globalLimit) {
        byIp.set(ip, bucket)
        return { allowed: false, retryAfterSeconds: retryAfter(global[0], now) }
      }

      bucket.push(now)
      global.push(now)
      byIp.set(ip, bucket)

      // memory hygiene: prune empty buckets, cap distinct IPs
      if (byIp.size > maxIps) {
        for (const [key, times] of byIp) {
          if (key === ip) continue
          if (times.every((t) => t <= cutoff)) byIp.delete(key)
          if (byIp.size <= maxIps) break
        }
        if (byIp.size > maxIps) {
          const stalest = byIp.keys().next().value
          if (stalest !== undefined && stalest !== ip) byIp.delete(stalest)
        }
      }
      return { allowed: true }
    },
  }
}

// module-level default instances used by the route
export const explainCache = createExplainCache()
export const explainLimiter = createRateLimiter()
