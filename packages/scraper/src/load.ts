import type { Database, NewListing, NewPack, NewPull, NewSale } from '@renaisslens/db'
import {
  appendPackMetricsIfChanged,
  insertPullsDedup,
  insertSalesDedup,
  upsertListing,
  upsertPack,
} from '@renaisslens/db'

export function loadPacks(
  db: Database,
  packs: NewPack[],
  snapshotId: number,
  now: string,
): { upserted: number; historyAppends: number } {
  let historyAppends = 0
  const run = db.transaction(() => {
    for (const pack of packs) {
      upsertPack(db, pack, snapshotId, now)
      if (appendPackMetricsIfChanged(db, pack, snapshotId, now)) historyAppends++
    }
  })
  run()
  return { upserted: packs.length, historyAppends }
}

/**
 * Returns overlap stats: when inserted === returned (zero overlap with rows we
 * already knew), the pull-feed window likely overflowed between polls and
 * pulls were missed — reported per cycle and surfaced in METHODOLOGY.
 */
export function loadPulls(
  db: Database,
  pulls: NewPull[],
  snapshotId: number,
  now: string,
): { returned: number; inserted: number; windowLikelyOverflowed: boolean } {
  const { returned, inserted } = insertPullsDedup(db, pulls, snapshotId, now)
  return { returned, inserted, windowLikelyOverflowed: returned > 0 && inserted === returned }
}

export function loadListings(
  db: Database,
  listings: NewListing[],
  snapshotId: number,
  now: string,
): { upserted: number } {
  const run = db.transaction(() => {
    for (const listing of listings) upsertListing(db, listing, snapshotId, now)
  })
  run()
  return { upserted: listings.length }
}

export function loadSales(
  db: Database,
  sales: NewSale[],
  snapshotId: number,
  now: string,
): { returned: number; inserted: number } {
  return insertSalesDedup(db, sales, snapshotId, now)
}
