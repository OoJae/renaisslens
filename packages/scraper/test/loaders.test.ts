import type { Database } from '@renaisslens/db'
import {
  countRows,
  insertSnapshot,
  latestPulls,
  openDb,
  recentSales,
  runMigrations,
} from '@renaisslens/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadListings, loadPacks, loadPulls, loadSales } from '../src/load'

const NOW = '2026-07-03T12:00:00.000Z'
const LATER = '2026-07-03T13:00:00.000Z'

function freshDb(): { db: Database; snapshotId: number } {
  const db = openDb(':memory:')
  runMigrations(db)
  const snapshotId = insertSnapshot(db, {
    source: 'test',
    cycleId: NOW,
    url: 'test://fixture',
    rawPath: 'test/raw.json',
    contentSha256: 'deadbeef',
    fetchedAt: NOW,
    status: 'ok',
  })
  return { db, snapshotId }
}

const OMEGA = {
  slug: 'omega',
  name: 'OMEGA',
  packType: 'perpetual',
  stage: 'active',
  description: null,
  author: 'Renaiss',
  priceCents: 4800,
  expectedValueCents: 5184,
  featuredCardFmvCents: 153200,
}

describe('loadPacks', () => {
  it('upserts and appends history only on change', () => {
    const { db, snapshotId } = freshDb()
    let r = loadPacks(db, [OMEGA], snapshotId, NOW)
    expect(r).toEqual({ upserted: 1, historyAppends: 1 }) // first observation always recorded

    r = loadPacks(db, [OMEGA], snapshotId, LATER)
    expect(r.historyAppends).toBe(0) // unchanged → no append

    r = loadPacks(db, [{ ...OMEGA, expectedValueCents: 5300 }], snapshotId, LATER)
    expect(r.historyAppends).toBe(1) // EV claim moved → append
    expect(countRows(db, 'pack_metric_history')).toBe(2)
    expect(countRows(db, 'packs')).toBe(1)
    db.close()
  })
})

describe('loadPulls', () => {
  it('dedupes across overlapping polls and measures overlap', () => {
    const { db, snapshotId } = freshDb()
    loadPacks(db, [OMEGA], snapshotId, NOW)
    const poll1 = [
      { packSlug: 'omega', collectibleTokenId: '111', tier: 'C', fmvCents: 4900, pulledAt: 1_783_073_208 },
      { packSlug: 'omega', collectibleTokenId: '222', tier: 'S', fmvCents: 63510, pulledAt: 1_783_070_346 },
    ]
    let stats = loadPulls(db, poll1, snapshotId, NOW)
    expect(stats).toMatchObject({ returned: 2, inserted: 2, windowLikelyOverflowed: true })

    // second poll overlaps one row, adds one new
    const poll2 = [
      poll1[0]!,
      { packSlug: 'omega', collectibleTokenId: '333', tier: 'B', fmvCents: 6100, pulledAt: 1_783_075_000 },
    ]
    stats = loadPulls(db, poll2, snapshotId, LATER)
    expect(stats).toMatchObject({ returned: 2, inserted: 1, windowLikelyOverflowed: false })
    expect(countRows(db, 'pack_pulls')).toBe(3)
    db.close()
  })

  it('same token re-pulled after buyback/restock is a NEW row (pulled_at in key)', () => {
    const { db, snapshotId } = freshDb()
    loadPacks(db, [OMEGA], snapshotId, NOW)
    const first = { packSlug: 'omega', collectibleTokenId: '999', tier: 'A', fmvCents: 10100, pulledAt: 1_783_000_000 }
    loadPulls(db, [first], snapshotId, NOW)
    const rePull = { ...first, pulledAt: 1_783_099_999 }
    const stats = loadPulls(db, [rePull], snapshotId, LATER)
    expect(stats.inserted).toBe(1)
    expect(latestPulls(db, 'omega', 10)).toHaveLength(2)
    db.close()
  })
})

describe('loadListings', () => {
  const LISTING = {
    tokenId: '555',
    name: 'Scizor Holo PSA 9',
    setName: 'Neo Discovery',
    cardNumber: '10',
    pokemonName: 'Scizor',
    gradingCompany: 'PSA',
    grade: '9',
    year: 2001,
    language: 'English',
    vaultLocation: 'platform',
    ownerAddress: '0xabc',
    ownerUsername: null,
    askPriceCents: 2_040_000,
    askExpiresAt: null,
    fmvCents: 120_000,
    attributesJson: null,
  }

  it('upserts by token and logs history only on price change', () => {
    const { db, snapshotId } = freshDb()
    loadListings(db, [LISTING], snapshotId, NOW)
    expect(countRows(db, 'listing_history')).toBe(1) // first sighting recorded

    loadListings(db, [LISTING], snapshotId, LATER)
    expect(countRows(db, 'listing_history')).toBe(1) // unchanged → no append
    expect(countRows(db, 'listings')).toBe(1)

    loadListings(db, [{ ...LISTING, askPriceCents: 1_999_900 }], snapshotId, LATER)
    expect(countRows(db, 'listing_history')).toBe(2)
    db.close()
  })
})

describe('loadSales', () => {
  it('INSERT OR IGNORE by activity_id across polls', () => {
    const { db, snapshotId } = freshDb()
    const sale = {
      activityId: '0xfeed',
      tokenId: null,
      cardTitle: 'Charizard VMAX PSA 10',
      setName: null,
      grade: null,
      gradingCompany: null,
      priceCents: 153_200,
      pctChange: 2.4,
      soldAt: NOW,
      source: 'site:home-activities:flight',
    }
    let stats = loadSales(db, [sale], snapshotId, NOW)
    expect(stats).toEqual({ returned: 1, inserted: 1 })
    stats = loadSales(db, [sale], snapshotId, LATER)
    expect(stats).toEqual({ returned: 1, inserted: 0 })
    expect(recentSales(db, 10)).toHaveLength(1)
    db.close()
  })
})
