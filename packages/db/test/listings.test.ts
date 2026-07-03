import { describe, expect, it } from 'vitest'
import type { Database, NewListing, NewPull } from '../src/index'
import {
  countPullsForPack,
  insertPullsDedup,
  insertSnapshot,
  listingAnomalies,
  medianAskToFmvRatio,
  openDb,
  runMigrations,
  upsertListing,
} from '../src/index'

function dbWith(ratios: (readonly [number | null, number | null])[]): Database {
  const db = openDb(':memory:')
  runMigrations(db)
  const snapshotId = insertSnapshot(db, {
    source: 'test',
    cycleId: 'c',
    url: 't://',
    rawPath: 'r',
    contentSha256: 's',
    fetchedAt: '2026-07-03',
    status: 'ok',
  })
  ratios.forEach(([ask, fmv], i) => {
    const l: NewListing = {
      tokenId: `t${i}`,
      name: `card ${i}`,
      setName: null,
      cardNumber: null,
      pokemonName: null,
      gradingCompany: null,
      grade: null,
      year: null,
      language: null,
      vaultLocation: null,
      ownerAddress: null,
      ownerUsername: null,
      askPriceCents: ask,
      askExpiresAt: null,
      fmvCents: fmv,
      attributesJson: null,
    }
    upsertListing(db, l, snapshotId, '2026-07-03')
  })
  return db
}

describe('medianAskToFmvRatio', () => {
  it('returns null on an empty listings table', () => {
    const db = dbWith([])
    expect(medianAskToFmvRatio(db)).toBeNull()
    db.close()
  })

  it('returns the sole ratio for one listing', () => {
    const db = dbWith([[1200, 1000]])
    expect(medianAskToFmvRatio(db)).toBeCloseTo(1.2, 9)
    db.close()
  })

  it('returns the middle ratio for an odd count', () => {
    const db = dbWith([
      [1000, 1000], // 1.0
      [3000, 1000], // 3.0
      [2000, 1000], // 2.0
    ])
    expect(medianAskToFmvRatio(db)).toBeCloseTo(2.0, 9)
    db.close()
  })

  it('averages the two middle ratios for an even count', () => {
    const db = dbWith([
      [1000, 1000], // 1.0
      [2000, 1000], // 2.0
      [4000, 1000], // 4.0
      [5000, 1000], // 5.0
    ])
    expect(medianAskToFmvRatio(db)).toBeCloseTo((2.0 + 4.0) / 2, 9)
    db.close()
  })

  it('ignores listings missing ask or fmv', () => {
    const db = dbWith([
      [null as unknown as number, 1000],
      [1500, null as unknown as number],
      [2000, 1000], // the only qualifying row → 2.0
    ])
    expect(medianAskToFmvRatio(db)).toBeCloseTo(2.0, 9)
    db.close()
  })
})

describe('listingAnomalies', () => {
  it('ranks both directions together by symmetric divergence', () => {
    // ratios: 3.0 above, 0.4 below (divergence 2.5), 1.6, 1.0
    const db = dbWith([
      [3000, 1000],
      [400, 1000],
      [1600, 1000],
      [1000, 1000],
    ])
    const rows = listingAnomalies(db, 2.0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ direction: 'above-fmv', divergence: 3.0 })
    expect(rows[0]?.ratio).toBeCloseTo(3.0, 9)
    expect(rows[1]).toMatchObject({ direction: 'below-fmv' })
    expect(rows[1]?.divergence).toBeCloseTo(2.5, 9)
    expect(rows[1]?.ratio).toBeCloseTo(0.4, 9)
    db.close()
  })

  it('respects the limit and excludes NULL/zero-priced rows', () => {
    const db = dbWith([
      [5000, 1000], // 5.0
      [4000, 1000], // 4.0
      [null, 1000],
      [3000, null],
      [0, 1000], // ask 0 excluded by ask > 0 guard
    ])
    const rows = listingAnomalies(db, 2.0, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.divergence).toBeCloseTo(5.0, 9)
    db.close()
  })

  it('returns [] on an empty table', () => {
    const db = dbWith([])
    expect(listingAnomalies(db, 2.0)).toEqual([])
    db.close()
  })
})

describe('countPullsForPack', () => {
  it('counts per slug and returns 0 for an unknown slug', () => {
    const db = openDb(':memory:')
    runMigrations(db)
    const snapshotId = insertSnapshot(db, {
      source: 'test',
      cycleId: 'c',
      url: 't://',
      rawPath: 'r',
      contentSha256: 's',
      fetchedAt: '2026-07-03',
      status: 'ok',
    })
    db.prepare(
      `INSERT INTO packs (slug, name, pack_type, stage, description, author, price_cents,
        expected_value_cents, featured_card_fmv_cents, first_seen_at, last_seen_at, snapshot_id)
       VALUES ('omega','OMEGA','g','active',NULL,NULL,4800,NULL,NULL,'2026-07-03','2026-07-03',?),
              ('eden','Eden','g','active',NULL,NULL,15000,NULL,NULL,'2026-07-03','2026-07-03',?)`,
    ).run(snapshotId, snapshotId)
    const pulls: NewPull[] = [
      { packSlug: 'omega', collectibleTokenId: '1', tier: 'C', fmvCents: 3000, pulledAt: 1 },
      { packSlug: 'omega', collectibleTokenId: '2', tier: 'C', fmvCents: 3100, pulledAt: 2 },
      { packSlug: 'eden', collectibleTokenId: '3', tier: 'common', fmvCents: 6000, pulledAt: 3 },
    ]
    insertPullsDedup(db, pulls, snapshotId, '2026-07-03')
    expect(countPullsForPack(db, 'omega')).toBe(2)
    expect(countPullsForPack(db, 'eden')).toBe(1)
    expect(countPullsForPack(db, 'nope')).toBe(0)
    db.close()
  })
})
