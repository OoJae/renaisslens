import { CONFIG } from './config'

export class CollectorError extends Error {
  constructor(
    readonly source: string,
    readonly url: string,
    readonly causeErr: unknown,
  ) {
    super(`CollectorError(${source}): ${url} — ${String(causeErr)}`)
    this.name = 'CollectorError'
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * One process-global serial queue: EVERY outbound request (API, homepage,
 * Playwright navigation) acquires a slot here, so the ≥2s spacing holds
 * across collectors, not just within one.
 */
let queueTail: Promise<void> = Promise.resolve()
let lastRequestAt = 0

export function acquireSlot(): Promise<void> {
  const acquired = queueTail.then(async () => {
    const wait = lastRequestAt + CONFIG.minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
  })
  // keep the chain alive even if a caller's work throws later
  queueTail = acquired.catch(() => {})
  return acquired
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

export interface PoliteResponse {
  url: string
  status: number
  rawText: string
  fetchedAt: string
  durationMs: number
}

/**
 * Rate-limited, identified, retrying GET. Returns the byte-exact body text —
 * the caller snapshots that string verbatim before any parsing.
 */
export async function politeGet(
  url: string,
  opts: { source: string; timeoutMs?: number; accept?: string } = { source: 'unknown' },
): Promise<PoliteResponse> {
  const timeoutMs = opts.timeoutMs ?? CONFIG.apiTimeoutMs
  let lastError: unknown
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const base = Math.min(CONFIG.backoffCapMs, CONFIG.backoffBaseMs * 2 ** attempt)
      await sleep(base * (0.5 + Math.random() * 0.5))
    }
    await acquireSlot()
    const startedAt = Date.now()
    const controller = new AbortController()
    // the timer stays armed through the BODY read, not just the headers
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': CONFIG.userAgent,
          accept: opts.accept ?? 'application/json',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      if (RETRYABLE_STATUS.has(res.status)) {
        await res.text().catch(() => {}) // consume the body so the socket is released
        clearTimeout(timer)
        const retryAfter = Number(res.headers.get('retry-after'))
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          // server-controlled, so cap it — a stray `Retry-After: 86400` must not
          // stall the whole serial pipeline for a day
          await sleep(Math.min(retryAfter * 1000, CONFIG.backoffCapMs))
        }
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }
      const rawText = await res.text()
      clearTimeout(timer)
      if (!res.ok) {
        // non-retryable 4xx/5xx: fail fast with the body preserved for diagnosis
        throw new CollectorError(opts.source, url, `HTTP ${res.status}: ${rawText.slice(0, 300)}`)
      }
      return {
        url,
        status: res.status,
        rawText,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof CollectorError) throw err
      lastError = err // network error / abort — retry
    }
  }
  throw new CollectorError(opts.source, url, lastError)
}

/** Mock mode swaps this in so any accidental network call fails loudly. */
export function assertNoNetwork(): void {
  const boom = () => {
    throw new Error('network access attempted in mock mode — this is a bug')
  }
  ;(globalThis as { fetch: unknown }).fetch = boom
}
