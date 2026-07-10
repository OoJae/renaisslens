/** All defaults are usable with zero env vars. Env overrides are optional. */
export const CONFIG = {
  apiBaseUrl: process.env.RENAISS_API_URL ?? 'https://api.renaiss.xyz',
  siteBaseUrl: process.env.RENAISS_SITE_URL ?? 'https://www.renaiss.xyz',

  // Renaiss OS Index API — independent reference prices cross-checked against
  // Renaiss's own FMV. Integrated (see api/indexPricing.ts); the key gates it.
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

  // watch-loop cadences (ms). 'api-index' runs daily — reference prices move
  // slowly and each cycle makes up to ~40 spaced search calls; the source
  // self-skips when unkeyed, so an unconfigured deploy simply does nothing.
  cadences: {
    'api-packs': 30 * 60_000,
    'api-pack-details': 30 * 60_000,
    'api-marketplace': 6 * 3_600_000,
    'site-home-activities': 30 * 60_000,
    'api-index': 24 * 3_600_000,
  } as Record<string, number>,
} as const

/**
 * Call-time gate for the Index API — mirrors the AI explainer's
 * `Boolean(process.env.ANTHROPIC_API_KEY?.trim())`. A function, not a value
 * baked into the frozen CONFIG at import, so a restarted process / test sees the
 * current env. When unset, the api-index source self-skips with no network call.
 */
export const indexApiConfigured = (): boolean => Boolean(process.env.RENAISS_INDEX_API_KEY?.trim())

/** Index API partner credentials (sent as X-Api-Key / X-Api-Secret headers). */
export const indexApiCredentials = (): { key: string; secret: string } => ({
  key: process.env.RENAISS_INDEX_API_KEY?.trim() ?? '',
  secret: process.env.RENAISS_INDEX_API_SECRET?.trim() ?? '',
})
