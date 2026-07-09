import type { EvRunHistoryRow, EvRunRow } from '@renaisslens/db'
import type { Assumption, HistogramBin } from '@renaisslens/ev-engine'

/**
 * Shared parsing of persisted ev_runs blobs — used by the pack detail page
 * AND the AI explainer route, so both consume identical data ("the exact
 * numbers used" the guardrail prompt must cite).
 */
export interface ScenarioRun {
  row: EvRunRow
  histogram: HistogramBin[] | null
  histogramOf: 'pull' | 'ev' | null
  assumptions: Assumption[] | null
}

/** Defensive JSON.parse — persisted blobs must degrade to section fallbacks, never crash a page. */
export function parseJson<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function parseHistogram(value: unknown): HistogramBin[] | null {
  if (!Array.isArray(value)) return null
  const bins = value.filter(
    (b): b is HistogramBin =>
      typeof b === 'object' &&
      b !== null &&
      Number.isFinite((b as HistogramBin).loCents) &&
      Number.isFinite((b as HistogramBin).hiCents) &&
      Number.isFinite((b as HistogramBin).count),
  )
  return bins.length > 0 ? bins : null
}

export function parseAssumptions(raw: string): Assumption[] | null {
  const value = parseJson<unknown>(raw)
  if (!Array.isArray(value)) return null
  const rows = value.filter(
    (a): a is Assumption =>
      typeof a === 'object' && a !== null && typeof (a as Assumption).name === 'string',
  )
  return rows.length > 0 ? rows : null
}

export function toScenarioRun(row: EvRunRow): ScenarioRun {
  const params = parseJson<{ histogram?: unknown; histogramOf?: unknown }>(row.params_json)
  const of = params?.histogramOf
  return {
    row,
    histogram: parseHistogram(params?.histogram),
    histogramOf: of === 'pull' || of === 'ev' ? of : null,
    assumptions: parseAssumptions(row.assumptions_json),
  }
}

/** One point on the confidence-over-time chart: the EV range at a pull count. */
export interface ConfidencePoint {
  ranAt: string
  pulls: number
  p10: number
  p50: number
  p90: number
  widthCents: number
}

/**
 * ev_runs history → a confidence series keyed by observed pull count. The
 * pull-count-at-run lives in `assumptions_json` (extracted defensively in TS —
 * a malformed blob degrades to a dropped point, never a thrown page). Runs at
 * the same pull count are deduped to the freshest one (seed jitter and the
 * post-500 saturation pile-up collapse to a single terminal point).
 */
export function toConfidenceSeries(rows: EvRunHistoryRow[]): ConfidencePoint[] {
  const byPulls = new Map<number, ConfidencePoint>()
  for (const row of rows) {
    if (row.p10_cents === null || row.p50_cents === null || row.p90_cents === null) continue
    const assumptions = parseAssumptions(row.assumptions_json)
    const pullAssumption = assumptions?.find((a) => a.name === 'observed_pull_count')
    const pulls = Number(pullAssumption?.value)
    if (!Number.isFinite(pulls)) continue
    // rows arrive ran_at ASC, so a later row overwrites → latest-per-pull-count wins
    byPulls.set(pulls, {
      ranAt: row.ran_at,
      pulls,
      p10: row.p10_cents,
      p50: row.p50_cents,
      p90: row.p90_cents,
      widthCents: Math.max(0, row.p90_cents - row.p10_cents),
    })
  }
  return [...byPulls.values()].sort((a, b) => a.pulls - b.pulls)
}
