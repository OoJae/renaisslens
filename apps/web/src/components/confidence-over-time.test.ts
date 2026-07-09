import { describe, expect, it } from 'vitest'
import type { ConfidencePoint } from '@/lib/pack-data'
import { buildAriaLabel, centsToY, pullsToX } from './confidence-over-time'

const pt = (pulls: number, p10: number, p50: number, p90: number): ConfidencePoint => ({
  ranAt: '2026-07-01T00:00:00.000Z',
  pulls,
  p10,
  p50,
  p90,
  widthCents: Math.max(0, p90 - p10),
})

describe('pullsToX', () => {
  it('maps the domain endpoints to the plot edges', () => {
    expect(pullsToX(20, 20, 500)).toBeCloseTo(52, 6) // left margin
    expect(pullsToX(500, 20, 500)).toBeCloseTo(704, 6) // left + plotW
  })
  it('centers a degenerate (single-value) domain', () => {
    expect(pullsToX(42, 42, 42)).toBeCloseTo(378, 6)
  })
})

describe('centsToY', () => {
  it('inverts: yMax at the top, yMin at the bottom', () => {
    expect(centsToY(10000, 4000, 10000)).toBeCloseTo(24, 6) // top margin
    expect(centsToY(4000, 4000, 10000)).toBeCloseTo(226, 6) // top + plotH
  })
})

describe('buildAriaLabel', () => {
  it('says "narrowed" when the range tightens', () => {
    const label = buildAriaLabel([pt(20, 3000, 6000, 12000), pt(200, 5000, 6000, 8000)], 'neutral')
    expect(label).toContain('narrowed')
  })
  it('says "widened" when the range grows', () => {
    const label = buildAriaLabel([pt(20, 5000, 6000, 8000), pt(200, 3000, 6000, 12000)], 'neutral')
    expect(label).toContain('widened')
  })
  it('describes a single run without a direction word', () => {
    const label = buildAriaLabel([pt(30, 4000, 6000, 10000)], 'neutral')
    expect(label).toContain('single EV run')
    expect(label).not.toContain('narrowed')
  })
  it('handles empty input', () => {
    expect(buildAriaLabel([], 'neutral')).toContain('no history yet')
  })
})
