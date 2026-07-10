import { CONFIG, indexApiCredentials } from '../config'
import { type PoliteResponse, politeGet } from '../politeClient'

/**
 * Renaiss OS Index client (api.renaissos.com) — READ-ONLY GET wrappers, keyed
 * with the partner X-Api-Key / X-Api-Secret headers. politeGet keeps the
 * identified UA and ≥2s spacing; the credentials only add auth. All prices are
 * the Index's own valuations (attribution handled at display).
 */

function authHeaders(): Record<string, string> {
  const { key, secret } = indexApiCredentials()
  return { 'X-Api-Key': key, 'X-Api-Secret': secret }
}

const INDEX_SOURCE = 'api-index'

export function getIndices(): Promise<PoliteResponse> {
  return politeGet(`${CONFIG.indexApiBaseUrl}/v1/indices`, {
    source: INDEX_SOURCE,
    headers: authHeaders(),
  })
}

export function getRecentTrades(): Promise<PoliteResponse> {
  return politeGet(`${CONFIG.indexApiBaseUrl}/v1/trades/recent`, {
    source: INDEX_SOURCE,
    headers: authHeaders(),
  })
}

export function searchCards(query: string): Promise<PoliteResponse> {
  const params = new URLSearchParams({ q: query })
  return politeGet(`${CONFIG.indexApiBaseUrl}/v1/search?${params}`, {
    source: INDEX_SOURCE,
    headers: authHeaders(),
  })
}
