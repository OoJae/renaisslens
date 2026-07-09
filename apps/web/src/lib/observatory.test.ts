import type { ObservatoryPullRow, PackRow } from '@renaisslens/db'
import { describe, expect, it } from 'vitest'
import { buildObservatory } from './observatory'

const pack = (over: Partial<PackRow> & Pick<PackRow, 'slug' | 'name'>): PackRow => ({
  pack_type: 'perpetual',
  stage: 'active',
  description: null,
  author: null,
  price_cents: 4800,
  expected_value_cents: 5184,
  featured_card_fmv_cents: 153200,
  first_seen_at: '2026-07-01T00:00:00.000Z',
  last_seen_at: '2026-07-01T00:00:00.000Z',
  source: 'api-packs',
  snapshot_id: 1,
  ...over,
})

const pull = (pack_slug: string, tier: string, fmv_cents: number): ObservatoryPullRow => ({
  pack_slug,
  tier,
  fmv_cents,
})

describe('buildObservatory', () => {
  it('groups pulls by pack and tier with correct proportions', () => {
    const packs = [pack({ slug: 'omega', name: 'OMEGA' })]
    const pulls = [
      ...Array.from({ length: 18 }, () => pull('omega', 'C', 4000)),
      pull('omega', 'A', 10300),
      pull('omega', 'S', 78007),
    ]
    const [obs] = buildObservatory(packs, pulls)
    if (obs === undefined) throw new Error('missing pack')
    expect(obs.totalPulls).toBe(20)
    expect(obs.sufficient).toBe(true)
    // tiers ordered by observed mean FMV descending
    expect(obs.tiers.map((t) => t.tier)).toEqual(['S', 'A', 'C'])
    const c = obs.tiers.find((t) => t.tier === 'C')
    expect(c?.n).toBe(18)
    expect(c?.proportion.point).toBeCloseTo(0.9, 9)
    expect(c?.proportion.lo).toBeGreaterThan(0)
    expect(c?.proportion.hi).toBeLessThanOrEqual(1)
  })

  it('marks packs below the 20-pull threshold insufficient', () => {
    const packs = [pack({ slug: 'small', name: 'Small' })]
    const pulls = Array.from({ length: 5 }, () => pull('small', 'C', 3000))
    const [obs] = buildObservatory(packs, pulls)
    expect(obs?.sufficient).toBe(false)
    expect(obs?.totalPulls).toBe(5)
  })

  it('handles a pack with zero observed pulls', () => {
    const packs = [pack({ slug: 'empty', name: 'Empty' })]
    const [obs] = buildObservatory(packs, [])
    expect(obs?.totalPulls).toBe(0)
    expect(obs?.tiers).toEqual([])
    expect(obs?.observedMean).toBeNull()
    expect(obs?.sufficient).toBe(false)
  })

  it('carries a null claimed EV through untouched', () => {
    const packs = [pack({ slug: 'noev', name: 'No EV', expected_value_cents: null })]
    const [obs] = buildObservatory(packs, [pull('noev', 'C', 3000)])
    expect(obs?.claimedEvCents).toBeNull()
  })

  it('produces a deterministic observed-mean CI that brackets the mean', () => {
    const packs = [pack({ slug: 'omega', name: 'OMEGA' })]
    const pulls = [
      ...Array.from({ length: 10 }, () => pull('omega', 'C', 4000)),
      pull('omega', 'S', 100000),
    ]
    const a = buildObservatory(packs, pulls)[0]?.observedMean
    const b = buildObservatory(packs, pulls)[0]?.observedMean
    expect(a).toEqual(b)
    if (a === null || a === undefined) throw new Error('missing mean')
    expect(a.lo).toBeLessThanOrEqual(a.mean)
    expect(a.hi).toBeGreaterThanOrEqual(a.mean)
  })

  it('keeps packs isolated from each other', () => {
    const packs = [pack({ slug: 'a', name: 'A' }), pack({ slug: 'b', name: 'B' })]
    const pulls = [pull('a', 'C', 3000), pull('b', 'C', 5000), pull('b', 'S', 90000)]
    const built = buildObservatory(packs, pulls)
    expect(built.find((p) => p.slug === 'a')?.totalPulls).toBe(1)
    expect(built.find((p) => p.slug === 'b')?.totalPulls).toBe(2)
  })
})
