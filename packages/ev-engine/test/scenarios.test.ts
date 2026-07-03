import { describe, expect, it } from 'vitest'
import {
  buildScenarios,
  HEADLINE_SCENARIO,
  modelFamilyOf,
  parseMixtureParams,
  parseReferencePriorParams,
  VERDICT_SCENARIOS,
} from '../src/index'

const inputs = {
  priceCents: 4800,
  topPrizeFmvCents: 153_200,
  renaissClaimedEvCents: 5184,
  pullCount: 30,
  tierSummary: [
    { tier: 'S', n: 2, avgFmvCents: 85_255 },
    { tier: 'C', n: 25, avgFmvCents: 3748 },
  ],
  feedOverlapRatio: 0.6,
  listingAskToFmvMedian: 1.02,
}

describe('buildScenarios', () => {
  it('returns the canonical five, including the headline and all verdict scenarios', () => {
    const names = buildScenarios(inputs).map((s) => s.name)
    expect(names).toEqual([
      'as-observed',
      'generous',
      'neutral',
      'house-favored',
      'reference-prior',
    ])
    expect(names).toContain(HEADLINE_SCENARIO)
    for (const v of VERDICT_SCENARIOS) expect(names).toContain(v)
  })

  it('every scenario parses back into valid engine parameters', () => {
    for (const scenario of buildScenarios(inputs)) {
      const family = modelFamilyOf(scenario)
      if (family === 'tiered-mixture') {
        expect(() => parseMixtureParams(scenario)).not.toThrow()
      } else {
        expect(parseReferencePriorParams(scenario)).toEqual({ holdLo: 0.1, holdHi: 0.4 })
      }
    }
  })

  it('neutral carries the documented parameters', () => {
    const neutral = buildScenarios(inputs).find((s) => s.name === 'neutral')
    if (neutral === undefined) throw new Error('neutral scenario missing')
    const params = parseMixtureParams(neutral)
    expect(params.feedHitBiasFactor).toBe(2)
    expect(params.fmvHaircut).toBe(0.9)
    expect(params.topPrizeOddsLo).toBeCloseTo(1 / 3000, 9)
    expect(params.topPrizeOddsHi).toBeCloseTo(1 / 1000, 9)
  })

  it('as-observed turns the top-prize component off', () => {
    const asObserved = buildScenarios(inputs).find((s) => s.name === 'as-observed')
    if (asObserved === undefined) throw new Error('as-observed scenario missing')
    const params = parseMixtureParams(asObserved)
    expect(params.topPrizeOddsLo).toBe(0)
    expect(params.topPrizeOddsHi).toBe(0)
    expect(params.feedHitBiasFactor).toBe(1)
    expect(params.fmvHaircut).toBe(1)
  })

  it('disables the top-prize channel for every scenario when no featured FMV exists', () => {
    // a pack with pulls but a null/0 featured-card FMV must not emit odds bands
    // the simulator would then reject — every mixture scenario zeroes the band
    for (const topPrize of [null, 0]) {
      const scenarios = buildScenarios({ ...inputs, topPrizeFmvCents: topPrize })
      for (const s of scenarios.filter((x) => x.name !== 'reference-prior')) {
        const p = parseMixtureParams(s)
        expect(p.topPrizeOddsLo).toBe(0)
        expect(p.topPrizeOddsHi).toBe(0)
      }
    }
  })

  it('carries observed and inferred records with the right confidence labels', () => {
    const neutral = buildScenarios(inputs).find((s) => s.name === 'neutral')
    if (neutral === undefined) throw new Error('neutral scenario missing')
    const byName = new Map(neutral.assumptions.map((a) => [a.name, a]))
    expect(byName.get('pack_price_cents')).toMatchObject({ value: 4800, confidence: 'observed' })
    expect(byName.get('observed_pull_count')).toMatchObject({ value: 30, confidence: 'observed' })
    expect(byName.get('tier_counts')).toMatchObject({ value: 'S:2 C:25', confidence: 'observed' })
    expect(byName.get('renaiss_claimed_ev_cents')).toMatchObject({
      value: 5184,
      confidence: 'observed',
    })
    expect(byName.get('feed_overlap_ratio')).toMatchObject({ value: 0.6, confidence: 'inferred' })
    expect(byName.get('listing_ask_to_fmv_median')).toMatchObject({
      value: 1.02,
      confidence: 'inferred',
    })
    // every scenario parameter is labeled assumed
    expect(byName.get('feed_hit_bias_factor')?.confidence).toBe('assumed')
    expect(byName.get('fmv_haircut')?.confidence).toBe('assumed')
  })

  it('omits optional context records when absent', () => {
    const scenarios = buildScenarios({
      priceCents: 10_000,
      topPrizeFmvCents: null,
      renaissClaimedEvCents: null,
      pullCount: 0,
      tierSummary: [],
    })
    const first = scenarios[0]
    if (first === undefined) throw new Error('expected scenarios')
    const names = new Set(first.assumptions.map((a) => a.name))
    expect(names.has('top_prize_fmv_cents')).toBe(false)
    expect(names.has('renaiss_claimed_ev_cents')).toBe(false)
    expect(names.has('feed_overlap_ratio')).toBe(false)
    expect(names.has('tier_counts')).toBe(false)
  })
})
