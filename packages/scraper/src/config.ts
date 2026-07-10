/** All defaults are usable with zero env vars. Env overrides are optional. */
export const CONFIG = {
  apiBaseUrl: process.env.RENAISS_API_URL ?? 'https://api.renaiss.xyz',
  siteBaseUrl: process.env.RENAISS_SITE_URL ?? 'https://www.renaiss.xyz',

  // Renaiss Index API — external reference prices to cross-check FMV. PLANNED,
  // not integrated: we have the host but no documented endpoint/response schema.
  // Base URL only; the key gates the (currently dormant) source.
  indexApiBaseUrl: process.env.RENAISS_INDEX_API_URL ?? 'https://api.renaissos.com',

  // Politeness — self-imposed; the API publishes no rate limits (documented in METHODOLOGY.md)
  userAgent:
    'RenaissLens-Hackathon/1.0 (Renaiss Tech Hackathon S1 entry; contact: olamiyeoluwademilade@gmail.com)',
  minIntervalMs: 2_000,
  apiTimeoutMs: 15_000,
  pageTimeoutMs: 30_000,
  maxRetries: 4,
  backoffBaseMs: 1_000,
  backoffCapMs: 30_000,

  // Marketplace coverage: most recent N pages of 100 by list date (a labeled sample, not a census)
  marketplacePages: 3,
  marketplacePageSize: 100,

  // watch-loop cadences (ms). NOTE: 'api-index' is deliberately absent — the
  // watch loop iterates these keys, and a parser-less source must never be
  // polled. Its cadence is added only when the index integration is activated.
  cadences: {
    'api-packs': 30 * 60_000,
    'api-pack-details': 30 * 60_000,
    'api-marketplace': 6 * 3_600_000,
    'site-home-activities': 30 * 60_000,
  } as Record<string, number>,
} as const

/**
 * Call-time gate for the (planned) Index API — mirrors the AI explainer's
 * `Boolean(process.env.ANTHROPIC_API_KEY?.trim())`. A function, not a value
 * baked into the frozen CONFIG at import, so a restarted process / test sees
 * the current env. Note: even once keyed, the index source stays dormant until
 * a real parser lands (see docs/index-api-activation.md).
 */
export const indexApiConfigured = (): boolean => Boolean(process.env.RENAISS_INDEX_API_KEY?.trim())

/**
 * Index API credentials, read at call time. The auth SCHEME (how key/secret
 * sign a request — Bearer, x-api-key, HMAC, Basic …) is not yet known, so these
 * are only surfaced for the activation seam in api/indexPricing.ts; nothing
 * transmits them until the real endpoint + auth scheme are wired.
 */
export const indexApiCredentials = (): { key: string; secret: string } => ({
  key: process.env.RENAISS_INDEX_API_KEY?.trim() ?? '',
  secret: process.env.RENAISS_INDEX_API_SECRET?.trim() ?? '',
})
