import type { EvRunRow } from '@renaisslens/db'
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
