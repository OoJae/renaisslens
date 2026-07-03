import { describe, expect, it } from 'vitest'
import type { Database, NewSale } from '../src/index'
import {
  insertSalesDedup,
  insertSnapshot,
  latestSaleAt,
  openDb,
  runMigrations,
  salesBatchInfo,
  salesSince,
} from '../src/index'

function freshDb(): Database {
  const db = openDb(':memory:')
  runMigrations(db)
  return db
}

function snapshot(db: Database, fetchedAt: string): number {
  return insertSnapshot(db, {
    source: 'test',
    cycleId: fetchedAt,
    url: 'test://',
    rawPath: 'r',
    contentSha256: 's',
    fetchedAt,
    status: 'ok',
  })
}

const sale = (over: Partial<NewSale> & { activityId: string }): NewSale => ({
  tokenId: null,
  cardTitle: 'PSA 10 Gem Mint 2021 Pokemon Japanese Promo #1 Pikachu',
  setName: null,
  grade: '10',
  gradingCompany: 'PSA',
  priceCents: 10_000,
  pctChange: null,
  soldAt: '2026-07-03T10:00:00.000Z',
  source: 'test',
  ...over,
})

describe('latestSaleAt', () => {
  it('returns null on an empty table', () => {
    const db = freshDb()
    expect(latestSaleAt(db)).toBeNull()
    db.close()
  })

  it('returns the max sold_at, letting NULL sold_at rows participate via observed_at', () => {
    const db = freshDb()
    const snap = snapshot(db, '2026-07-03T11:00:00.000Z')
    insertSalesDedup(
      db,
      [
        sale({ activityId: 'a', soldAt: '2026-07-03T09:00:00.000Z' }),
        // observed_at ('2026-07-03T12:00:00.000Z' below) outranks every sold_at
        sale({ activityId: 'b', soldAt: null }),
      ],
      snap,
      '2026-07-03T12:00:00.000Z',
    )
    expect(latestSaleAt(db)).toBe('2026-07-03T12:00:00.000Z')
    db.close()
  })
})

describe('salesSince', () => {
  it('applies an inclusive cutoff and orders newest-first with id tiebreak', () => {
    const db = freshDb()
    const snap = snapshot(db, '2026-07-03T11:00:00.000Z')
    insertSalesDedup(
      db,
      [
        sale({ activityId: 'old', soldAt: '2026-07-02T09:00:00.000Z' }),
        sale({ activityId: 'edge', soldAt: '2026-07-03T00:00:00.000Z' }),
        sale({ activityId: 'new', soldAt: '2026-07-03T10:00:00.000Z' }),
      ],
      snap,
      '2026-07-03T11:00:00.000Z',
    )
    const rows = salesSince(db, '2026-07-03T00:00:00.000Z')
    expect(rows.map((r) => r.activity_id)).toEqual(['new', 'edge']) // inclusive, DESC
    db.close()
  })
})

describe('salesBatchInfo', () => {
  it('reports zero snapshots on an empty table', () => {
    const db = freshDb()
    expect(salesBatchInfo(db)).toEqual({
      snapshotCount: 0,
      firstObservedAt: null,
      lastObservedAt: null,
    })
    db.close()
  })

  it('counts distinct snapshots and the observed_at span', () => {
    const db = freshDb()
    const snap1 = snapshot(db, '2026-07-03T10:00:00.000Z')
    const snap2 = snapshot(db, '2026-07-03T10:30:00.000Z')
    insertSalesDedup(db, [sale({ activityId: 'a' })], snap1, '2026-07-03T10:00:00.000Z')
    insertSalesDedup(db, [sale({ activityId: 'b' })], snap2, '2026-07-03T10:30:00.000Z')
    expect(salesBatchInfo(db)).toEqual({
      snapshotCount: 2,
      firstObservedAt: '2026-07-03T10:00:00.000Z',
      lastObservedAt: '2026-07-03T10:30:00.000Z',
    })
    db.close()
  })
})
