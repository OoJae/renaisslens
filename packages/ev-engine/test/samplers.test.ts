import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/rng'
import { dirichlet, gammaSample, logUniform } from '../src/samplers'

describe('gammaSample', () => {
  it('matches Gamma(shape) mean and variance (both = shape) within tolerance', () => {
    const rng = mulberry32(7)
    const shape = 2.5
    const n = 50_000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const g = gammaSample(shape, rng)
      expect(g).toBeGreaterThan(0)
      sum += g
      sumSq += g * g
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    expect(mean).toBeCloseTo(shape, 1)
    expect(Math.abs(variance - shape)).toBeLessThan(0.2)
  })

  it('handles shape < 1 via the boost identity', () => {
    const rng = mulberry32(11)
    const n = 50_000
    let sum = 0
    for (let i = 0; i < n; i++) {
      const g = gammaSample(0.5, rng)
      expect(g).toBeGreaterThanOrEqual(0)
      sum += g
    }
    expect(sum / n).toBeCloseTo(0.5, 1)
  })

  it('rejects non-positive shapes', () => {
    const rng = mulberry32(1)
    expect(() => gammaSample(0, rng)).toThrow()
    expect(() => gammaSample(-1, rng)).toThrow()
  })
})

describe('dirichlet', () => {
  it('draws sum to 1 with all components positive', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 1000; i++) {
      const w = dirichlet([30.5, 3.5, 0.7], rng)
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
      for (const x of w) expect(x).toBeGreaterThan(0)
    }
  })
})

describe('logUniform', () => {
  it('the [0, 0] band means "off" and returns 0', () => {
    const rng = mulberry32(5)
    expect(logUniform(0, 0, rng)).toBe(0)
  })

  it('a degenerate band returns its single point', () => {
    const rng = mulberry32(5)
    expect(logUniform(0.05, 0.05, rng)).toBe(0.05)
  })

  it('stays inside the band', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 10_000; i++) {
      const v = logUniform(1 / 3000, 1 / 1000, rng)
      expect(v).toBeGreaterThanOrEqual(1 / 3000)
      expect(v).toBeLessThanOrEqual(1 / 1000)
    }
  })

  it('rejects lo = 0 with hi > 0 and inverted bands', () => {
    const rng = mulberry32(5)
    expect(() => logUniform(0, 0.1, rng)).toThrow()
    expect(() => logUniform(0.2, 0.1, rng)).toThrow()
  })
})
