import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { bootstrapMeanCI, jeffreysInterval, wilsonInterval } from '../src/intervals'

describe('wilsonInterval', () => {
  it('n = 0 → whole line, no point', () => {
    expect(wilsonInterval(0, 0)).toEqual({ point: null, lo: 0, hi: 1, k: 0, n: 0 })
  })

  it('k = 0 pins lo to 0; k = n pins hi to 1', () => {
    const none = wilsonInterval(0, 10)
    expect(none.lo).toBe(0)
    expect(none.hi).toBeGreaterThan(0)
    const all = wilsonInterval(10, 10)
    expect(all.hi).toBe(1)
    expect(all.lo).toBeLessThan(1)
  })

  it('all-in-one-tier (k = n = 1) and single-trial edges stay in [0, 1]', () => {
    for (const [k, n] of [
      [0, 1],
      [1, 1],
    ] as const) {
      const ci = wilsonInterval(k, n)
      expect(ci.lo).toBeGreaterThanOrEqual(0)
      expect(ci.hi).toBeLessThanOrEqual(1)
      expect(ci.lo).toBeLessThanOrEqual(ci.hi)
    }
  })

  it('matches known Wilson references (0/10 and 5/10)', () => {
    const a = wilsonInterval(0, 10)
    expect(a.lo).toBeCloseTo(0, 6)
    expect(a.hi).toBeCloseTo(0.2775, 3)
    const b = wilsonInterval(5, 10)
    expect(b.lo).toBeCloseTo(0.2366, 3)
    expect(b.hi).toBeCloseTo(0.7634, 3)
  })

  it('brackets the point estimate and narrows as n grows at fixed p̂', () => {
    const small = wilsonInterval(5, 10)
    const large = wilsonInterval(50, 100)
    expect(small.point).toBeCloseTo(0.5, 9)
    expect(large.point).toBeCloseTo(0.5, 9)
    expect(small.lo).toBeLessThanOrEqual(0.5)
    expect(small.hi).toBeGreaterThanOrEqual(0.5)
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo)
  })

  it('rejects non-integer or out-of-range inputs', () => {
    expect(() => wilsonInterval(2, 1)).toThrow()
    expect(() => wilsonInterval(-1, 5)).toThrow()
    expect(() => wilsonInterval(1.5, 5)).toThrow()
  })

  it('property: 0 ≤ lo ≤ point ≤ hi ≤ 1 for all 0 ≤ k ≤ n ≤ 500', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), (a, b) => {
        const n = Math.max(a, b)
        const k = Math.min(a, b)
        const ci = wilsonInterval(k, n)
        expect(ci.lo).toBeGreaterThanOrEqual(0)
        expect(ci.hi).toBeLessThanOrEqual(1 + 1e-12)
        expect(ci.lo).toBeLessThanOrEqual(ci.hi + 1e-12)
        if (ci.point !== null) {
          expect(ci.lo).toBeLessThanOrEqual(ci.point + 1e-9)
          expect(ci.point).toBeLessThanOrEqual(ci.hi + 1e-9)
        }
      }),
    )
  })
})

describe('jeffreysInterval', () => {
  it('boundary pins at k = 0 and k = n', () => {
    expect(jeffreysInterval(0, 8).lo).toBe(0)
    expect(jeffreysInterval(8, 8).hi).toBe(1)
  })

  it('agrees with Wilson to within a few points at moderate n', () => {
    const w = wilsonInterval(5, 20)
    const j = jeffreysInterval(5, 20)
    expect(Math.abs((w.lo as number) - j.lo)).toBeLessThan(0.05)
    expect(Math.abs((w.hi as number) - j.hi)).toBeLessThan(0.05)
  })

  it('matches the Beta(2.5, 8.5) 95% quantiles (Jeffreys 2/10)', () => {
    // qbeta(0.025, 2.5, 8.5) ≈ 0.0441, qbeta(0.975, 2.5, 8.5) ≈ 0.5069
    const j = jeffreysInterval(2, 10)
    expect(j.lo).toBeCloseTo(0.0441, 2)
    expect(j.hi).toBeCloseTo(0.5069, 2)
  })

  it('satisfies the incomplete-beta symmetry lo(k,n) = 1 − hi(n−k,n)', () => {
    // Independent of any tabulated constant: validates the betaInv inversion.
    const lo = jeffreysInterval(2, 10).lo
    const hiMirror = jeffreysInterval(8, 10).hi
    expect(lo).toBeCloseTo(1 - hiMirror, 6)
  })
})

describe('bootstrapMeanCI', () => {
  it('single observation → degenerate interval at that value', () => {
    expect(bootstrapMeanCI([4200], { seed: 'x' })).toEqual({ mean: 4200, lo: 4200, hi: 4200, n: 1 })
  })

  it('is deterministic under a fixed seed', () => {
    const values = [30, 45, 51, 620, 40, 33, 1070, 44]
    const a = bootstrapMeanCI(values, { seed: 'omega|pull-mean|v1' })
    const b = bootstrapMeanCI(values, { seed: 'omega|pull-mean|v1' })
    expect(a).toEqual(b)
  })

  it('brackets the sample mean and is wider for a more skewed sample', () => {
    const tight = [50, 51, 49, 50, 52, 48, 50, 51]
    const skewed = [50, 51, 49, 50, 52, 48, 50, 2000]
    const t = bootstrapMeanCI(tight, { seed: 7 })
    const s = bootstrapMeanCI(skewed, { seed: 7 })
    const tMean = tight.reduce((a, b) => a + b, 0) / tight.length
    expect(t.lo).toBeLessThanOrEqual(tMean)
    expect(t.hi).toBeGreaterThanOrEqual(tMean)
    expect(s.hi - s.lo).toBeGreaterThan(t.hi - t.lo)
  })

  it('rejects an empty sample', () => {
    expect(() => bootstrapMeanCI([], { seed: 1 })).toThrow()
  })
})
