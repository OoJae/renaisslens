import { describe, expect, it } from 'vitest'
import { mulberry32, seedFromString } from '../src/rng'

describe('mulberry32', () => {
  it('same seed produces the identical sequence', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    const seqA = Array.from({ length: 1000 }, () => a())
    const seqB = Array.from({ length: 1000 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds diverge', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('outputs stay in [0, 1)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 10_000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seedFromString', () => {
  it('is deterministic and case-sensitive', () => {
    expect(seedFromString('omega')).toBe(seedFromString('omega'))
    expect(seedFromString('omega')).not.toBe(seedFromString('OMEGA'))
  })
})
