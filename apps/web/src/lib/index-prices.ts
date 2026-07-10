import { allIndexPrices, type Database, type IndexPriceRow } from '@renaisslens/db'

/** Index rows are refetched daily; older than this = a stalled collector, drop it. */
export const INDEX_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Fresh Renaiss OS Index prices keyed by match_key — the one staleness truth
 * shared by every surface that cross-references a listing (TS join via
 * indexMatchKey; no cert exists, so identity is the normalized tuple).
 */
export function freshIndexByKey(db: Database): Map<string, IndexPriceRow> {
  const staleBefore = new Date(Date.now() - INDEX_MAX_AGE_MS).toISOString()
  const fresh = allIndexPrices(db).filter((p) => p.observed_at >= staleBefore)
  return new Map(fresh.map((p) => [p.match_key, p]))
}
