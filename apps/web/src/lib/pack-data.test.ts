import type { EvRunHistoryRow } from '@renaisslens/db'
import { describe, expect, it } from 'vitest'
import { toConfidenceSeries } from './pack-data'

const row = (over: Partial<EvRunHistoryRow> & { id: number; ran_at: string }): EvRunHistoryRow => ({
  p10_cents: 4000,
  p50_cents: 6000,
  p90_cents: 10000,
  assumptions_json: JSON.stringify([
    { name: 'observed_pull_count', value: 30, source: 'feed', confidence: 'observed' },
  ]),
  ...over,
})

const withPulls = (n: number) =>
  JSON.stringify([
    { name: 'observed_pull_count', value: n, source: 'feed', confidence: 'observed' },
  ])

describe('toConfidenceSeries', () => {
  it('extracts pulls and computes width per point', () => {
    const series = toConfidenceSeries([
      row({
        id: 1,
        ran_at: '2026-07-01T00:00:00.000Z',
        p10_cents: 4000,
        p90_cents: 10000,
        assumptions_json: withPulls(25),
      }),
    ])
    expect(series).toHaveLength(1)
    expect(series[0]?.pulls).toBe(25)
    expect(series[0]?.widthCents).toBe(6000)
  })

  it('dedups same pull count to the latest ran_at', () => {
    const series = toConfidenceSeries([
      row({
        id: 1,
        ran_at: '2026-07-01T00:00:00.000Z',
        p90_cents: 20000,
        assumptions_json: withPulls(30),
      }),
      row({
        id: 2,
        ran_at: '2026-07-02T00:00:00.000Z',
        p90_cents: 12000,
        assumptions_json: withPulls(30),
      }),
    ])
    expect(series).toHaveLength(1)
    // later row (narrower P90) wins
    expect(series[0]?.p90).toBe(12000)
    expect(series[0]?.ranAt).toBe('2026-07-02T00:00:00.000Z')
  })

  it('drops rows with null percentiles or missing pull count', () => {
    const series = toConfidenceSeries([
      row({ id: 1, ran_at: 'a', p10_cents: null }),
      row({
        id: 2,
        ran_at: 'b',
        assumptions_json: JSON.stringify([
          { name: 'other', value: 1, source: 's', confidence: 'observed' },
        ]),
      }),
      row({ id: 3, ran_at: 'c', assumptions_json: 'not json' }),
      row({ id: 4, ran_at: 'd', assumptions_json: withPulls(40) }),
    ])
    expect(series).toHaveLength(1)
    expect(series[0]?.pulls).toBe(40)
  })

  it('orders points by pull count ascending', () => {
    const series = toConfidenceSeries([
      row({ id: 1, ran_at: 'a', assumptions_json: withPulls(80) }),
      row({ id: 2, ran_at: 'b', assumptions_json: withPulls(30) }),
      row({ id: 3, ran_at: 'c', assumptions_json: withPulls(120) }),
    ])
    expect(series.map((p) => p.pulls)).toEqual([30, 80, 120])
  })

  it('a single run yields a single point (the fallback path)', () => {
    const series = toConfidenceSeries([
      row({ id: 1, ran_at: 'a', assumptions_json: withPulls(50) }),
    ])
    expect(series).toHaveLength(1)
  })

  it('returns empty for empty input', () => {
    expect(toConfidenceSeries([])).toEqual([])
  })
})
