import { describe, expect, it } from 'vitest'
import type { Database, NewListing, NewSale } from '../src/index'
import {
  getListingByTokenId,
  getSnapshotById,
  insertSalesDedup,
  insertSnapshot,
  listGradedListings,
  listingHistory,
  openDb,
  runMigrations,
  salesForToken,
  upsertListing,
} from '../src/index'

const BASE: Omit<NewListing, 'tokenId' | 'name'> = {
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
  askPriceCents: null,
  askExpiresAt: null,
  fmvCents: null,
  attributesJson: null,
}

function freshDb(): { db: Database; snapshotId: number } {
  const db = openDb(':memory:')
  runMigrations(db)
  const snapshotId = insertSnapshot(db, {
    source: 'test',
    cycleId: 'c',
    url: 't://',
    rawPath: 'r',
    contentSha256: 'abc123def456',
    fetchedAt: '2026-07-03',
    status: 'ok',
  })
  return { db, snapshotId }
}

describe('getListingByTokenId', () => {
  it('returns the row and undefined for an unknown token', () => {
    const { db, snapshotId } = freshDb()
    upsertListing(db, { ...BASE, tokenId: '42', name: 'Pikachu' }, snapshotId, '2026-07-03')
    expect(getListingByTokenId(db, '42')?.name).toBe('Pikachu')
    expect(getListingByTokenId(db, '43')).toBeUndefined()
    db.close()
  })

  it('round-trips a 78-digit uint256 token id as TEXT', () => {
    const { db, snapshotId } = freshDb()
    const huge = '9'.repeat(78)
    upsertListing(db, { ...BASE, tokenId: huge, name: 'Mega' }, snapshotId, '2026-07-03')
    expect(getListingByTokenId(db, huge)?.token_id).toBe(huge)
    db.close()
  })
})

describe('listGradedListings', () => {
  it('includes only rows with BOTH grading company and grade', () => {
    const { db, snapshotId } = freshDb()
    upsertListing(
      db,
      { ...BASE, tokenId: '1', name: 'graded', gradingCompany: 'PSA', grade: '10' },
      snapshotId,
      '2026-07-03',
    )
    upsertListing(
      db,
      { ...BASE, tokenId: '2', name: 'company-only', gradingCompany: 'PSA' },
      snapshotId,
      '2026-07-03',
    )
    upsertListing(
      db,
      { ...BASE, tokenId: '3', name: 'grade-only', grade: '9' },
      snapshotId,
      '2026-07-03',
    )
    upsertListing(db, { ...BASE, tokenId: '4', name: 'raw' }, snapshotId, '2026-07-03')
    const rows = listGradedListings(db)
    expect(rows.map((r) => r.token_id)).toEqual(['1'])
    db.close()
  })

  it('ranks richer records first, then value, with a deterministic tiebreak', () => {
    const { db, snapshotId } = freshDb()
    // sparse: identity only
    upsertListing(
      db,
      { ...BASE, tokenId: '10', name: 'sparse', gradingCompany: 'CGC', grade: '8' },
      snapshotId,
      '2026-07-03',
    )
    // rich: identity + set/number/prices/custody
    upsertListing(
      db,
      {
        ...BASE,
        tokenId: '11',
        name: 'rich',
        gradingCompany: 'PSA',
        grade: '10',
        setName: 'Base Set',
        cardNumber: '4',
        fmvCents: 10_000,
        askPriceCents: 12_000,
        vaultLocation: 'Vault A',
        ownerUsername: 'ash',
        year: 1999,
        language: 'EN',
      },
      snapshotId,
      '2026-07-03',
    )
    // same richness as sparse but higher value → ranks above sparse
    upsertListing(
      db,
      {
        ...BASE,
        tokenId: '12',
        name: 'valuable',
        gradingCompany: 'PSA',
        grade: '9',
        fmvCents: 99_000,
      },
      snapshotId,
      '2026-07-03',
    )
    const rows = listGradedListings(db)
    expect(rows.map((r) => r.token_id)).toEqual(['11', '12', '10'])
    expect(listGradedListings(db, 2)).toHaveLength(2)
    db.close()
  })

  it('returns [] on an empty table', () => {
    const { db } = freshDb()
    expect(listGradedListings(db)).toEqual([])
    db.close()
  })
})

describe('listingHistory', () => {
  it('appends only on price change and returns oldest→newest', () => {
    const { db, snapshotId } = freshDb()
    const l: NewListing = { ...BASE, tokenId: '7', name: 'x', askPriceCents: 1000, fmvCents: 900 }
    upsertListing(db, l, snapshotId, '2026-07-01')
    upsertListing(db, l, snapshotId, '2026-07-02') // identical prices → no new row
    upsertListing(db, { ...l, askPriceCents: 1200 }, snapshotId, '2026-07-03')
    const rows = listingHistory(db, '7')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.ask_price_cents)).toEqual([1000, 1200])
    expect(rows.map((r) => r.observed_at)).toEqual(['2026-07-01', '2026-07-03'])
    expect(listingHistory(db, 'nope')).toEqual([])
    db.close()
  })
})

describe('getSnapshotById', () => {
  it('returns provenance fields and undefined for an unknown id', () => {
    const { db, snapshotId } = freshDb()
    const snap = getSnapshotById(db, snapshotId)
    expect(snap).toMatchObject({
      source: 'test',
      url: 't://',
      content_sha256: 'abc123def456',
      fetched_at: '2026-07-03',
    })
    expect(getSnapshotById(db, 999_999)).toBeUndefined()
    db.close()
  })
})

describe('salesForToken', () => {
  it('filters by token, ignores NULL-token rows, orders newest-first', () => {
    const { db, snapshotId } = freshDb()
    const sale = (activityId: string, tokenId: string | null, soldAt: string | null): NewSale => ({
      activityId,
      tokenId,
      cardTitle: 'Card',
      setName: null,
      grade: null,
      gradingCompany: null,
      priceCents: 5000,
      pctChange: null,
      soldAt,
      source: 'test',
    })
    insertSalesDedup(
      db,
      [
        sale('a1', '55', '2026-07-01'),
        sale('a2', '55', '2026-07-03'),
        sale('a3', null, '2026-07-02'),
        sale('a4', '66', '2026-07-02'),
      ],
      snapshotId,
      '2026-07-03',
    )
    const rows = salesForToken(db, '55')
    expect(rows.map((r) => r.activity_id)).toEqual(['a2', 'a1'])
    expect(salesForToken(db, '77')).toEqual([])
    db.close()
  })
})
