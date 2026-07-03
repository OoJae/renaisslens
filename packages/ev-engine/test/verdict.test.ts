import { describe, expect, it } from 'vitest'
import { computeVerdict, MIN_PULLS_FOR_EV, verdictLabel } from '../src/index'

const results = (generous: number, neutral: number, houseFavored: number) => [
  { scenario: 'generous', probEvAbovePrice: generous },
  { scenario: 'neutral', probEvAbovePrice: neutral },
  { scenario: 'house-favored', probEvAbovePrice: houseFavored },
]

describe('computeVerdict', () => {
  it('zero pulls → insufficient data (the world-cup-pack case)', () => {
    const { verdict, reason } = computeVerdict({ priceCents: 10_000, pullCount: 0, results: [] })
    expect(verdict).toBe('insufficient-data')
    expect(reason).toContain(`need ≥${MIN_PULLS_FOR_EV}`)
  })

  it('just below the pull threshold → insufficient data', () => {
    const { verdict } = computeVerdict({
      priceCents: 4800,
      pullCount: MIN_PULLS_FOR_EV - 1,
      results: results(1, 1, 1),
    })
    expect(verdict).toBe('insufficient-data')
  })

  it('missing verdict scenarios → insufficient data, even with enough pulls', () => {
    const { verdict } = computeVerdict({
      priceCents: 4800,
      pullCount: 30,
      results: [{ scenario: 'neutral', probEvAbovePrice: 0.9 }],
    })
    expect(verdict).toBe('insufficient-data')
  })

  it('+EV only when neutral is confident AND house-favored does not contradict', () => {
    expect(
      computeVerdict({ priceCents: 4800, pullCount: 30, results: results(0.99, 0.95, 0.6) })
        .verdict,
    ).toBe('plus-ev-likely')
    // confident neutral but house-favored disagrees → uncertain
    expect(
      computeVerdict({ priceCents: 4800, pullCount: 30, results: results(0.99, 0.95, 0.3) })
        .verdict,
    ).toBe('uncertain')
  })

  it('−EV only when neutral is confidently negative AND even generous agrees', () => {
    expect(
      computeVerdict({ priceCents: 15_000, pullCount: 30, results: results(0.4, 0.05, 0.01) })
        .verdict,
    ).toBe('minus-ev-likely')
    // generous scenario goes positive → uncertain
    expect(
      computeVerdict({ priceCents: 8800, pullCount: 60, results: results(0.7, 0.15, 0.02) })
        .verdict,
    ).toBe('uncertain')
  })

  it('middle ground → uncertain', () => {
    expect(
      computeVerdict({ priceCents: 8800, pullCount: 60, results: results(0.7, 0.5, 0.2) }).verdict,
    ).toBe('uncertain')
  })

  // pin the exact inclusive boundaries so a >= → > (or <= → <) mutation is caught
  it('the +EV thresholds are inclusive (neutral 0.80, house-favored 0.50)', () => {
    expect(
      computeVerdict({ priceCents: 4800, pullCount: 30, results: results(0.9, 0.8, 0.5) }).verdict,
    ).toBe('plus-ev-likely')
    // one tick below either boundary → not +EV
    expect(
      computeVerdict({ priceCents: 4800, pullCount: 30, results: results(0.9, 0.79, 0.5) }).verdict,
    ).toBe('uncertain')
    expect(
      computeVerdict({ priceCents: 4800, pullCount: 30, results: results(0.9, 0.8, 0.49) }).verdict,
    ).toBe('uncertain')
  })

  it('the −EV thresholds are inclusive (neutral 0.20, generous 0.50)', () => {
    expect(
      computeVerdict({ priceCents: 15_000, pullCount: 30, results: results(0.5, 0.2, 0.1) })
        .verdict,
    ).toBe('minus-ev-likely')
    // one tick above either boundary → not −EV
    expect(
      computeVerdict({ priceCents: 15_000, pullCount: 30, results: results(0.51, 0.2, 0.1) })
        .verdict,
    ).toBe('uncertain')
    expect(
      computeVerdict({ priceCents: 15_000, pullCount: 30, results: results(0.5, 0.21, 0.1) })
        .verdict,
    ).toBe('uncertain')
  })

  it('exactly MIN_PULLS_FOR_EV pulls is enough to publish a verdict', () => {
    expect(
      computeVerdict({
        priceCents: 4800,
        pullCount: MIN_PULLS_FOR_EV,
        results: results(0.9, 0.95, 0.6),
      }).verdict,
    ).toBe('plus-ev-likely')
  })
})

describe('verdictLabel', () => {
  it('maps every verdict to its badge text', () => {
    expect(verdictLabel('plus-ev-likely')).toBe('+EV likely')
    expect(verdictLabel('minus-ev-likely')).toBe('−EV likely')
    expect(verdictLabel('uncertain')).toBe('uncertain')
    expect(verdictLabel('insufficient-data')).toBe('insufficient data')
  })
})
