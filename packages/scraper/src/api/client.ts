import { CONFIG } from '../config'
import { type PoliteResponse, politeGet } from '../politeClient'

/**
 * Renaiss public API client — READ-ONLY BY CONSTRUCTION.
 * Only GET wrappers are exported; no code path in this repo can reach the
 * API's write endpoints (gacha pull / buyback). Same API the official
 * `npx renaiss` CLI wraps; base URL overridable via RENAISS_API_URL.
 *
 * The byte-exact response text is returned so callers snapshot it verbatim.
 */

export function getPacks(): Promise<PoliteResponse> {
  return politeGet(`${CONFIG.apiBaseUrl}/v0/packs`, { source: 'api-packs' })
}

export function getPackDetail(slug: string): Promise<PoliteResponse> {
  return politeGet(`${CONFIG.apiBaseUrl}/v0/packs/${encodeURIComponent(slug)}`, {
    source: `api-pack-detail:${slug}`,
  })
}

export function getMarketplacePage(offset: number, limit: number): Promise<PoliteResponse> {
  const params = new URLSearchParams({
    listed: 'true',
    sort: 'listDate',
    order: 'desc',
    limit: String(limit),
    offset: String(offset),
  })
  return politeGet(`${CONFIG.apiBaseUrl}/v0/marketplace?${params}`, { source: 'api-marketplace' })
}

export function getHomepage(): Promise<PoliteResponse> {
  return politeGet(CONFIG.siteBaseUrl, {
    source: 'site-home-activities',
    timeoutMs: CONFIG.pageTimeoutMs,
    accept: 'text/html,application/xhtml+xml',
  })
}
