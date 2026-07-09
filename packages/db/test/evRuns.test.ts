import { describe, expect, it } from 'vitest'
import type { NewEvRun } from '../src/index'
import {
  countRows,
  evRunHistory,
  insertEvRun,
  latestEvRuns,
  openDb,
  runMigrations,
} from '../src/index'

function freshDb() {
  const db = openDb(':memory:')
  runMigrations(db)
  // satisfy the FK chain: packs.snapshot_id → snapshots.id, ev_runs.pack_slug → packs.slug
  db.prepare(
    `INSERT INTO snapshots (source, cycle_id, url, raw_path, content_sha256, fetched_at, status)
     VALUES ('test', 'test', 'test://', 'x', 'sha', '2026-07-03', 'ok')`,
  ).run()
  db.prepare(
    `INSERT INTO packs (slug, name, pack_type, stage, description, author, price_cents,
                        expected_value_cents, featured_card_fmv_cents, first_seen_at, last_seen_at, snapshot_id)
     VALUES ('omega', 'OMEGA', 'gacha', 'active', NULL, NULL, 4800, NULL, NULL, '2026-07-03', '2026-07-03', 1)`,
  ).run()
  return db
}

const run = (over: Partial<NewEvRun>): NewEvRun => ({
  packSlug: 'omega',
  scenario: 'neutral',
  p10Cents: 5300,
  p50Cents: 7400,
  p90Cents: 9800,
  probBreakEven: 0.31,
  probTopPrize: 0.0005,
  probEvAbovePrice: 0.92,
  evMeanCents: 7500,
  iterations: 100_000,
  seed: 12345,
  paramsJson: '{}',
  assumptionsJson: '[]',
  ...over,
})

describe('ev_runs persistence', () => {
  it('inserts and returns the newest run per (pack, scenario)', () => {
    const db = freshDb()
    insertEvRun(db, run({ p50Cents: 7000 }), '2026-07-03T10:00:00Z')
    insertEvRun(db, run({ p50Cents: 7400 }), '2026-07-03T11:00:00Z')
    insertEvRun(db, run({ scenario: 'generous', p50Cents: 9000 }), '2026-07-03T11:00:00Z')

    const latest = latestEvRuns(db)
    expect(latest).toHaveLength(2)
    const neutral = latest.find((r) => r.scenario === 'neutral')
    const generous = latest.find((r) => r.scenario === 'generous')
    expect(neutral?.p50_cents).toBe(7400) // the newer of the two neutral runs
    expect(generous?.p50_cents).toBe(9000)
    expect(countRows(db, 'ev_runs')).toBe(3) // history is kept
    db.close()
  })

  it('round-trips provenance and probability fields', () => {
    const db = freshDb()
    const snapshotIds = [3, 7, 11]
    insertEvRun(
      db,
      run({ inputSnapshotIdsJson: JSON.stringify(snapshotIds) }),
      '2026-07-03T10:00:00Z',
    )
    const row = latestEvRuns(db)[0]
    if (row === undefined) throw new Error('expected a persisted run')
    expect(JSON.parse(row.input_snapshot_ids ?? '[]')).toEqual(snapshotIds)
    expect(row.prob_ev_above_price).toBeCloseTo(0.92, 9)
    expect(row.prob_break_even).toBeCloseTo(0.31, 9)
    expect(row.ev_mean_cents).toBe(7500)
    expect(row.seed).toBe(12345)
    expect(row.ran_at).toBe('2026-07-03T10:00:00Z')
    db.close()
  })

  it('provenance defaults to NULL when omitted', () => {
    const db = freshDb()
    insertEvRun(db, run({}), '2026-07-03T10:00:00Z')
    expect(latestEvRuns(db)[0]?.input_snapshot_ids).toBeNull()
    db.close()
  })
})

describe('evRunHistory', () => {
  it('returns ALL runs for a (pack, scenario), oldest→newest, not just latest', () => {
    const db = freshDb()
    insertEvRun(db, run({ p90Cents: 20000 }), '2026-07-03T10:00:00Z')
    insertEvRun(db, run({ p90Cents: 16000 }), '2026-07-03T11:00:00Z')
    insertEvRun(db, run({ p90Cents: 12000 }), '2026-07-03T12:00:00Z')

    const history = evRunHistory(db, 'omega', 'neutral')
    expect(history).toHaveLength(3)
    expect(history.map((r) => r.p90_cents)).toEqual([20000, 16000, 12000])
    expect(history[0]?.ran_at).toBe('2026-07-03T10:00:00Z')
    db.close()
  })

  it('filters by both pack and scenario', () => {
    const db = freshDb()
    insertEvRun(db, run({ scenario: 'neutral' }), '2026-07-03T10:00:00Z')
    insertEvRun(db, run({ scenario: 'generous' }), '2026-07-03T10:00:00Z')

    expect(evRunHistory(db, 'omega', 'neutral')).toHaveLength(1)
    expect(evRunHistory(db, 'omega', 'generous')).toHaveLength(1)
    expect(evRunHistory(db, 'omega', 'house-favored')).toHaveLength(0)
    db.close()
  })

  it('breaks ran_at ties deterministically by id', () => {
    const db = freshDb()
    insertEvRun(db, run({ p50Cents: 100 }), '2026-07-03T10:00:00Z')
    insertEvRun(db, run({ p50Cents: 200 }), '2026-07-03T10:00:00Z')
    const history = evRunHistory(db, 'omega', 'neutral')
    expect(history.map((r) => r.p50_cents)).toEqual([100, 200])
    db.close()
  })
})
