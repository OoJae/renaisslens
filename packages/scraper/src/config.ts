/** All defaults are usable with zero env vars. Env overrides are optional. */
export const CONFIG = {
  apiBaseUrl: process.env.RENAISS_API_URL ?? 'https://api.renaiss.xyz',
  siteBaseUrl: process.env.RENAISS_SITE_URL ?? 'https://www.renaiss.xyz',

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

  // watch-loop cadences (ms)
  cadences: {
    'api-packs': 30 * 60_000,
    'api-pack-details': 30 * 60_000,
    'api-marketplace': 6 * 3_600_000,
    'site-home-activities': 30 * 60_000,
  } as Record<string, number>,
} as const
