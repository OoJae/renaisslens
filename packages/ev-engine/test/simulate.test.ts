import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { EvScenario } from '../src/index'
import { buildHistogram, PARAM, type PoolInput, simulatePack } from '../src/index'

/** Minimal mixture scenario with explicit engine parameters. */
function mixtureScenario(
  over: Partial<{ beta: number; haircut: number; oddsLo: number; oddsHi: number }> = {},
  name = 'test-mixture',
): EvScenario {
  const assumed = (n: string, value: string | number) => ({
    name: n,
    value,
    source: 'test',
    confidence: 'assumed' as const,
  })
  return {
    name,
    assumptions: [
      assumed(PARAM.modelFamily, 'tiered-mixture'),
      assumed(PARAM.feedHitBiasFactor, over.beta ?? 1),
      assumed(PARAM.hitTierThresholdXPrice, 1.5),
      assumed(PARAM.topPrizeOddsLo, over.oddsLo ?? 0),
      assumed(PARAM.topPrizeOddsHi, over.oddsHi ?? 0),
      assumed(PARAM.fmvHaircut, over.haircut ?? 1),
      assumed(PARAM.tierPriorPseudocount, 0.5),
    ],
  }
}

const constantTier = (name: string, value: number, count: number) => ({
  name,
  fmvCents: new Array<number>(count).fill(value),
})

describe('simulatePack — analytic round-trips', () => {
  it('degenerate pool: one constant tier, no top prize → exact point mass', () => {
    const pool: PoolInput = { topPrizeFmvCents: null, tiers: [constantTier('only', 7000, 5)] }
    const below = simulatePack({
      packSlug: 'toy',
      priceCents: 5000,
      pool,
      scenario: mixtureScenario(),
      seed: 42,
      iterations: 10_000,
    })
    expect(below.p10Cents).toBe(7000)
    expect(below.p50Cents).toBe(7000)
    expect(below.p90Cents).toBe(7000)
    expect(below.evMeanCents).toBe(7000)
    expect(below.probBreakEven).toBe(1)
    expect(below.probTopPrize).toBe(0)
    expect(below.probEvAbovePrice).toBe(1)

    const above = simulatePack({
      packSlug: 'toy',
      priceCents: 8000,
      pool,
      scenario: mixtureScenario(),
      seed: 42,
      iterations: 10_000,
    })
    expect(above.probBreakEven).toBe(0)
    expect(above.probEvAbovePrice).toBe(0)
  })

  it('known top-prize mixture: fixed pTop=0.05 → EV exactly 5950, P(top) ≈ 0.05', () => {
    const pool: PoolInput = { topPrizeFmvCents: 100_000, tiers: [constantTier('floor', 1000, 1)] }
    const result = simulatePack({
      packSlug: 'toy',
      priceCents: 4000,
      pool,
      scenario: mixtureScenario({ oddsLo: 0.05, oddsHi: 0.05 }),
      seed: 99,
      iterations: 100_000,
    })
    // every EV draw = 0.95·1000 + 0.05·100000 = 5950, exactly
    expect(result.p10Cents).toBe(5950)
    expect(result.p50Cents).toBe(5950)
    expect(result.p90Cents).toBe(5950)
    expect(result.evMeanCents).toBe(5950)
    // binomial: 4σ = 4·√(0.05·0.95/100000) ≈ 0.00276
    expect(result.probTopPrize).not.toBeNull()
    expect(Math.abs((result.probTopPrize ?? 0) - 0.05)).toBeLessThan(0.0028)
  })

  it('two constant tiers: mean EV matches the Dirichlet posterior mean within 0.5%', () => {
    const pool: PoolInput = {
      topPrizeFmvCents: null,
      tiers: [constantTier('common', 2000, 30), constantTier('rare', 10_000, 10)],
    }
    const result = simulatePack({
      packSlug: 'toy',
      priceCents: 5000,
      pool,
      scenario: mixtureScenario(),
      seed: 7,
      iterations: 100_000,
    })
    // E[EV] = Σ E[w_i]·v_i with E[w_i] = α_i/Σα, α = counts + 0.5
    const analytic = (30.5 * 2000 + 10.5 * 10_000) / 41
    expect(Math.abs(result.evMeanCents - analytic) / analytic).toBeLessThan(0.005)
  })

  it('is deterministic: same input + seed → identical result; different seed differs', () => {
    const pool: PoolInput = {
      topPrizeFmvCents: 153_200,
      tiers: [
        { name: 'C', fmvCents: [2400, 3100, 3748, 4100, 5200] },
        { name: 'S', fmvCents: [85_255, 107_000] },
      ],
    }
    const input = {
      packSlug: 'omega-toy',
      priceCents: 4800,
      pool,
      scenario: mixtureScenario({ beta: 2, haircut: 0.9, oddsLo: 1 / 3000, oddsHi: 1 / 1000 }),
      seed: 1234,
      iterations: 20_000,
    }
    const a = simulatePack(input)
    const b = simulatePack(input)
    expect(a).toEqual(b)
    const c = simulatePack({ ...input, seed: 1235 })
    expect(c.p50Cents).not.toBe(a.p50Cents)
  })

  it('haircut is exactly linear: h=0.8 scales every percentile by 0.8 (±1¢)', () => {
    const pool: PoolInput = {
      topPrizeFmvCents: 100_000,
      tiers: [
        { name: 'low', fmvCents: [1500, 2000, 2500, 3000] },
        { name: 'high', fmvCents: [20_000, 30_000] },
      ],
    }
    const base = {
      packSlug: 'toy',
      priceCents: 5000,
      pool,
      seed: 555,
      iterations: 20_000,
    }
    const full = simulatePack({
      ...base,
      scenario: mixtureScenario({ haircut: 1, oddsLo: 1 / 2000, oddsHi: 1 / 500 }),
    })
    const cut = simulatePack({
      ...base,
      scenario: mixtureScenario({ haircut: 0.8, oddsLo: 1 / 2000, oddsHi: 1 / 500 }),
    })
    expect(Math.abs(cut.p10Cents - 0.8 * full.p10Cents)).toBeLessThanOrEqual(1)
    expect(Math.abs(cut.p50Cents - 0.8 * full.p50Cents)).toBeLessThanOrEqual(1)
    expect(Math.abs(cut.p90Cents - 0.8 * full.p90Cents)).toBeLessThanOrEqual(1)
  })

  it('raising the feed-bias factor never raises the EV of a hit-heavy pool', () => {
    const pool: PoolInput = {
      topPrizeFmvCents: null,
      tiers: [constantTier('common', 2000, 30), constantTier('hit', 30_000, 3)],
    }
    const base = { packSlug: 'toy', priceCents: 5000, pool, seed: 77, iterations: 50_000 }
    const fair = simulatePack({ ...base, scenario: mixtureScenario({ beta: 1 }) })
    const skeptical = simulatePack({ ...base, scenario: mixtureScenario({ beta: 5 }) })
    expect(skeptical.p50Cents).toBeLessThan(fair.p50Cents)
    expect(skeptical.evMeanCents).toBeLessThan(fair.evMeanCents)
  })

  it('a higher top-prize odds band never lowers P(top prize)', () => {
    const pool: PoolInput = { topPrizeFmvCents: 200_000, tiers: [constantTier('floor', 2000, 20)] }
    const base = { packSlug: 'toy', priceCents: 5000, pool, seed: 31, iterations: 100_000 }
    const lowBand = simulatePack({
      ...base,
      scenario: mixtureScenario({ oddsLo: 1e-4, oddsHi: 3e-4 }),
    })
    const highBand = simulatePack({
      ...base,
      scenario: mixtureScenario({ oddsLo: 2e-3, oddsHi: 5e-3 }),
    })
    expect(highBand.probTopPrize ?? 0).toBeGreaterThan(lowBand.probTopPrize ?? 0)
  })

  it('reference-prior: EV = price × (1 − hold), hold ~ U(0.10, 0.40)', () => {
    const scenario: EvScenario = {
      name: 'reference-prior',
      assumptions: [
        {
          name: PARAM.modelFamily,
          value: 'reference-prior',
          source: 'test',
          confidence: 'assumed',
        },
        { name: PARAM.referenceHoldLo, value: 0.1, source: 'test', confidence: 'assumed' },
        { name: PARAM.referenceHoldHi, value: 0.4, source: 'test', confidence: 'assumed' },
      ],
    }
    const result = simulatePack({
      packSlug: 'toy',
      priceCents: 10_000,
      pool: { topPrizeFmvCents: null, tiers: [] },
      scenario,
      seed: 21,
      iterations: 100_000,
    })
    // hold quantiles are exact for U(0.10, 0.40): p10 of EV ↔ p90 of hold
    expect(Math.abs(result.p10Cents - 10_000 * (1 - 0.37))).toBeLessThan(30)
    expect(Math.abs(result.p50Cents - 10_000 * (1 - 0.25))).toBeLessThan(30)
    expect(Math.abs(result.p90Cents - 10_000 * (1 - 0.13))).toBeLessThan(30)
    expect(result.probEvAbovePrice).toBe(0)
    // pull-level stats are NOT modeled here — honestly null, never a fabricated 0
    expect(result.probBreakEven).toBeNull()
    expect(result.probTopPrize).toBeNull()
    expect(result.histogramOf).toBe('ev')
  })

  it('mixture scenarios report pull-level stats and a pull histogram', () => {
    const result = simulatePack({
      packSlug: 'toy',
      priceCents: 5000,
      pool: { topPrizeFmvCents: null, tiers: [constantTier('t', 6000, 10)] },
      scenario: mixtureScenario(),
      seed: 3,
      iterations: 2000,
    })
    expect(result.probBreakEven).not.toBeNull()
    expect(result.probTopPrize).not.toBeNull()
    expect(result.histogramOf).toBe('pull')
  })

  it('all-hit pools: raising the feed-bias factor never RAISES EV (monotonicity)', () => {
    // every tier is a hit (mean ≥ 1.5× price), the regression case from review #17
    const pool: PoolInput = {
      topPrizeFmvCents: null,
      tiers: [constantTier('common', 800, 40), constantTier('rare', 3150, 8)],
    }
    const base = { packSlug: 'toy', priceCents: 500, pool, seed: 88, iterations: 60_000 }
    const fair = simulatePack({ ...base, scenario: mixtureScenario({ beta: 1 }) })
    const skeptical = simulatePack({ ...base, scenario: mixtureScenario({ beta: 5 }) })
    // skepticism must not inflate EV; for an all-hit pool it leaves the mean put
    // and only widens the range (relative weights unchanged)
    expect(skeptical.evMeanCents).toBeLessThanOrEqual(fair.evMeanCents + 1)
    expect(skeptical.p90Cents - skeptical.p10Cents).toBeGreaterThan(fair.p90Cents - fair.p10Cents)
  })
})

describe('buildHistogram', () => {
  it('empty input → no bins', () => {
    expect(buildHistogram(new Float64Array([]))).toEqual([])
  })

  it('constant input → a single bin holding every value', () => {
    const bins = buildHistogram(Float64Array.from({ length: 50 }, () => 7000))
    expect(bins).toEqual([{ loCents: 7000, hiCents: 7000, count: 50 }])
  })

  it('log-spaced regime: contiguous bins, geometric interior edge, counts conserved', () => {
    const values = Float64Array.from([100, 320, 1000, 3200, 10_000])
    const bins = buildHistogram(values, 2)
    expect(bins[0]?.loCents).toBe(100)
    expect(bins[bins.length - 1]?.hiCents).toBe(10_000)
    expect(bins[0]?.hiCents).toBe(1000) // 100 * sqrt(10000/100) = 1000
    expect(bins[1]?.loCents).toBe(bins[0]?.hiCents) // contiguous
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(values.length) // nothing dropped
    expect(bins[bins.length - 1]?.count).toBeGreaterThanOrEqual(1) // max lands in last bin
  })

  it('linear fallback when values touch zero', () => {
    const bins = buildHistogram(Float64Array.from([0, 50, 100]), 2)
    expect(bins[0]?.loCents).toBe(0)
    expect(bins[bins.length - 1]?.hiCents).toBe(100)
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3)
  })
})

describe('simulatePack — guards', () => {
  it('throws when a scenario assumes top-prize odds but the pool has no top prize', () => {
    expect(() =>
      simulatePack({
        packSlug: 'toy',
        priceCents: 5000,
        pool: { topPrizeFmvCents: null, tiers: [constantTier('t', 1000, 3)] },
        scenario: mixtureScenario({ oddsLo: 1e-4, oddsHi: 1e-3 }),
        seed: 1,
      }),
    ).toThrow(/top-prize/)
  })

  it('throws on an empty pool or empty tier', () => {
    expect(() =>
      simulatePack({
        packSlug: 'toy',
        priceCents: 5000,
        pool: { topPrizeFmvCents: null, tiers: [] },
        scenario: mixtureScenario(),
        seed: 1,
      }),
    ).toThrow(/no tiers/)
    expect(() =>
      simulatePack({
        packSlug: 'toy',
        priceCents: 5000,
        pool: { topPrizeFmvCents: null, tiers: [{ name: 'empty', fmvCents: [] }] },
        scenario: mixtureScenario(),
        seed: 1,
      }),
    ).toThrow(/no observed values/)
  })

  it('throws on missing scenario parameters', () => {
    const broken: EvScenario = {
      name: 'broken',
      assumptions: [
        { name: PARAM.modelFamily, value: 'tiered-mixture', source: 'test', confidence: 'assumed' },
      ],
    }
    expect(() =>
      simulatePack({
        packSlug: 'toy',
        priceCents: 5000,
        pool: { topPrizeFmvCents: null, tiers: [constantTier('t', 1000, 3)] },
        scenario: broken,
        seed: 1,
      }),
    ).toThrow(/missing or non-numeric/)
  })
})

describe('simulatePack — properties (fast-check)', () => {
  const tierArb = fc.record({
    name: fc.constantFrom('a', 'b', 'c', 'd'),
    fmvCents: fc.array(fc.integer({ min: 100, max: 200_000 }), { minLength: 1, maxLength: 20 }),
  })

  it('p10 ≤ p50 ≤ p90, all within the haircut-scaled value bounds', () => {
    fc.assert(
      fc.property(
        fc.array(tierArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1000, max: 20_000 }),
        fc.constantFrom({ lo: 0, hi: 0 }, { lo: 1 / 1000, hi: 1 / 500 }, { lo: 1e-4, hi: 1e-3 }),
        fc.constantFrom(0.8, 0.9, 1),
        fc.constantFrom(1, 2, 5),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (tiers, priceCents, band, haircut, beta, seed) => {
          const topPrizeFmvCents = band.hi > 0 ? 300_000 : null
          const result = simulatePack({
            packSlug: 'prop',
            priceCents,
            pool: { topPrizeFmvCents, tiers },
            scenario: mixtureScenario({ beta, haircut, oddsLo: band.lo, oddsHi: band.hi }),
            seed,
            iterations: 2000,
          })
          expect(result.p10Cents).toBeLessThanOrEqual(result.p50Cents)
          expect(result.p50Cents).toBeLessThanOrEqual(result.p90Cents)
          const values = tiers.flatMap((t) => t.fmvCents)
          const loBound = haircut * Math.min(...values) - 1
          const hiBound = haircut * Math.max(...values, topPrizeFmvCents ?? 0) + 1
          expect(result.p10Cents).toBeGreaterThanOrEqual(loBound)
          expect(result.p90Cents).toBeLessThanOrEqual(hiBound)
        },
      ),
      { numRuns: 50 },
    )
  })
})
