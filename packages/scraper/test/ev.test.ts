import type { Database } from '@renaisslens/db'
import {
  countRows,
  indexMatchKey,
  insertSnapshot,
  latestEvRuns,
  openDb,
  runMigrations,
  upsertIndexPrice,
} from '@renaisslens/db'
import { HEADLINE_SCENARIO, MIN_PULLS_FOR_EV } from '@renaisslens/ev-engine'
import { beforeEach, describe, expect, it } from 'vitest'
import { runEv } from '../src/ev'
import { loadPacks, loadPulls } from '../src/load'

const NOW = '2026-07-03T12:00:00.000Z'
const SCENARIO_COUNT = 5

const OMEGA = {
  slug: 'omega',
  name: 'OMEGA',
  packType: 'perpetual',
  stage: 'active',
  description: null,
  author: 'Renaiss',
  priceCents: 4800,
  expectedValueCents: 5184,
  featuredCardFmvCents: 153_200,
}

const WORLD_CUP = {
  ...OMEGA,
  slug: 'world-cup-pack',
  name: 'World Cup Pack',
  stage: 'soldout-or-restocking',
  priceCents: 10_000,
  featuredCardFmvCents: 380_000,
}

function seededDb(): { db: Database; snapshotId: number } {
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
  loadPacks(db, [OMEGA, WORLD_CUP], snapshotId, NOW)
  // MIN_PULLS_FOR_EV pulls for omega (2 hits + commons), zero for world-cup
  const pulls = Array.from({ length: MIN_PULLS_FOR_EV }, (_, i) => ({
    packSlug: 'omega',
    collectibleTokenId: `token-${i}`,
    tier: i < 2 ? 'S' : 'C',
    fmvCents: i < 2 ? 85_255 : 3000 + i * 100,
    pulledAt: 1_760_000_000 + i,
  }))
  loadPulls(db, pulls, snapshotId, NOW)
  return { db, snapshotId }
}

describe('runEv', () => {
  let ctx: { db: Database; snapshotId: number }
  beforeEach(() => {
    ctx = seededDb()
  })

  it('persists one run per scenario for eligible packs and skips insufficient ones', () => {
    const report = runEv({ db: ctx.db, iterations: 5000 })

    const omega = report.sources.find((s) => s.source === 'ev:omega')
    expect(omega?.status).toBe('ok')
    expect(omega?.detail).toContain('scenarios')
    expect(omega?.detail).toContain('P10–P90')
    expect(omega?.detail).toContain('verdict:')

    const worldCup = report.sources.find((s) => s.source === 'ev:world-cup-pack')
    expect(worldCup?.status).toBe('ok')
    expect(worldCup?.detail).toContain('insufficient data')

    expect(countRows(ctx.db, 'ev_runs')).toBe(SCENARIO_COUNT) // omega only
    const runs = latestEvRuns(ctx.db)
    expect(runs).toHaveLength(SCENARIO_COUNT)
    for (const run of runs) {
      expect(run.pack_slug).toBe('omega')
      expect(run.p10_cents).not.toBeNull()
      expect((run.p10_cents ?? 0) <= (run.p50_cents ?? 0)).toBe(true)
      expect((run.p50_cents ?? 0) <= (run.p90_cents ?? 0)).toBe(true)
    }
    ctx.db.close()
  })

  it('is reproducible: a second run inserts rows with identical ranges and seeds', () => {
    runEv({ db: ctx.db, iterations: 5000 })
    const first = latestEvRuns(ctx.db)
    runEv({ db: ctx.db, iterations: 5000 })
    const second = latestEvRuns(ctx.db)
    expect(countRows(ctx.db, 'ev_runs')).toBe(SCENARIO_COUNT * 2) // history kept
    for (const b of second) {
      const a = first.find((r) => r.scenario === b.scenario)
      expect(b.id).not.toBe(a?.id) // genuinely new rows…
      expect(b.p10_cents).toBe(a?.p10_cents) // …with identical published numbers
      expect(b.p50_cents).toBe(a?.p50_cents)
      expect(b.p90_cents).toBe(a?.p90_cents)
      expect(b.seed).toBe(a?.seed)
    }
    ctx.db.close()
  })

  it('records the provenance chain of input snapshot ids', () => {
    runEv({ db: ctx.db, iterations: 2000 })
    const run = latestEvRuns(ctx.db)[0]
    if (run === undefined) throw new Error('expected a persisted run')
    const ids = JSON.parse(run.input_snapshot_ids ?? '[]') as number[]
    expect(ids).toEqual([ctx.snapshotId])
    const params = JSON.parse(run.params_json) as {
      pool: { topPrizeFmvCents: number; tiers: { name: string; n: number }[] }
      verdict: { verdict: string }
    }
    expect(params.pool.topPrizeFmvCents).toBe(153_200)
    expect(params.pool.tiers.map((t) => t.name).sort()).toEqual(['C', 'S'])
    expect(params.verdict.verdict).toBeTruthy()
    ctx.db.close()
  })

  it('filters to a single pack and rejects unknown slugs', () => {
    const single = runEv({ db: ctx.db, pack: 'omega', iterations: 2000 })
    expect(single.sources).toHaveLength(1)
    expect(single.sources[0]?.source).toBe('ev:omega')

    const unknown = runEv({ db: ctx.db, pack: 'nope', iterations: 2000 })
    expect(unknown.sources[0]?.status).toBe('failed')
    expect(unknown.sources[0]?.detail).toContain('unknown pack')
    ctx.db.close()
  })

  it('published tier_counts sum to observed_pull_count (assumptions describe what ran)', () => {
    runEv({ db: ctx.db, iterations: 1000 })
    const run = latestEvRuns(ctx.db).find((r) => r.pack_slug === 'omega')
    if (run === undefined) throw new Error('expected an omega run')
    const assumptions = JSON.parse(run.assumptions_json) as {
      name: string
      value: string | number
    }[]
    const pullCount = assumptions.find((a) => a.name === 'observed_pull_count')?.value
    const tierCounts = String(assumptions.find((a) => a.name === 'tier_counts')?.value ?? '')
    const summed = tierCounts
      .split(' ')
      .map((part) => Number(part.split(':')[1]))
      .reduce((acc, n) => acc + n, 0)
    expect(summed).toBe(pullCount)
    expect(summed).toBe(MIN_PULLS_FOR_EV)
    ctx.db.close()
  })

  it('empty DB (no packs) reports ok/skipped, not failed — keeps the cycle exit code clean', () => {
    const db = openDb(':memory:')
    runMigrations(db)
    const report = runEv({ db, iterations: 500 })
    expect(report.sources[0]?.status).toBe('ok')
    expect(report.sources[0]?.detail).toContain('skipped')
    db.close()
  })

  // ── honesty invariants (these live only in prose otherwise) ──────────────

  it('invariant #6: an index_prices row cannot change any published EV range', () => {
    runEv({ db: ctx.db, iterations: 4000 })
    const before = latestEvRuns(ctx.db).find((r) => r.scenario === HEADLINE_SCENARIO)
    // insert an independent Index cross-price for a card — must be inert to EV
    upsertIndexPrice(
      ctx.db,
      {
        matchKey: indexMatchKey('PSA', '10 Gem Mint', 'Some Set', '001', 'English'),
        game: 'pokemon',
        name: 'Whatever',
        setName: 'Some Set',
        cardNumber: '001',
        gradingCompany: 'PSA',
        grade: '10 Gem Mint',
        priceCents: 123_456,
        currency: 'USD',
        confidence: 'high',
        deltaPct: 5,
        lastSaleAt: NOW,
        href: '/card/x',
      },
      NOW,
    )
    runEv({ db: ctx.db, iterations: 4000 })
    const after = latestEvRuns(ctx.db).find((r) => r.scenario === HEADLINE_SCENARIO)
    expect(after?.p10_cents).toBe(before?.p10_cents)
    expect(after?.p50_cents).toBe(before?.p50_cents)
    expect(after?.p90_cents).toBe(before?.p90_cents)
    ctx.db.close()
  })

  it('invariant #4: Renaiss’s claimed EV never influences the computed range', () => {
    const build = (claimedEvCents: number) => {
      const db = openDb(':memory:')
      runMigrations(db)
      const sid = insertSnapshot(db, {
        source: 'test',
        cycleId: NOW,
        url: 'test://fixture',
        rawPath: 'r',
        contentSha256: 's',
        fetchedAt: NOW,
        status: 'ok',
      })
      loadPacks(db, [{ ...OMEGA, expectedValueCents: claimedEvCents }], sid, NOW)
      const pulls = Array.from({ length: MIN_PULLS_FOR_EV }, (_, i) => ({
        packSlug: 'omega',
        collectibleTokenId: `token-${i}`,
        tier: i < 2 ? 'S' : 'C',
        fmvCents: i < 2 ? 85_255 : 3000 + i * 100,
        pulledAt: 1_760_000_000 + i,
      }))
      loadPulls(db, pulls, sid, NOW)
      runEv({ db, iterations: 4000 })
      const run = latestEvRuns(db).find((r) => r.scenario === HEADLINE_SCENARIO)
      db.close()
      return run
    }
    // identical pulls/pack; claimed EV differs 5x — the computed range must be identical
    const low = build(5184)
    const high = build(5184 * 5)
    expect(high?.p10_cents).toBe(low?.p10_cents)
    expect(high?.p50_cents).toBe(low?.p50_cents)
    expect(high?.p90_cents).toBe(low?.p90_cents)
  })

  it('a pack with NULL featured-card FMV still persists all scenarios (top-prize channel off)', () => {
    const db = openDb(':memory:')
    runMigrations(db)
    const snapshotId = insertSnapshot(db, {
      source: 'test',
      cycleId: NOW,
      url: 'test://fixture',
      rawPath: 'r',
      contentSha256: 's',
      fetchedAt: NOW,
      status: 'ok',
    })
    loadPacks(db, [{ ...OMEGA, featuredCardFmvCents: null }], snapshotId, NOW)
    const pulls = Array.from({ length: MIN_PULLS_FOR_EV }, (_, i) => ({
      packSlug: 'omega',
      collectibleTokenId: `t-${i}`,
      tier: 'C',
      fmvCents: 3000 + i * 50,
      pulledAt: 1_760_000_000 + i,
    }))
    loadPulls(db, pulls, snapshotId, NOW)

    const report = runEv({ db, iterations: 1000 })
    expect(report.sources[0]?.status).toBe('ok')
    expect(countRows(db, 'ev_runs')).toBe(SCENARIO_COUNT)
    const runs = latestEvRuns(db)
    for (const run of runs) {
      expect(run.prob_top_prize === null || run.prob_top_prize === 0).toBe(true)
    }
    db.close()
  })
})
