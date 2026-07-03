import type { EvRunRow } from '@renaisslens/db'
import { computeVerdict, HEADLINE_SCENARIO, type Verdict } from '@renaisslens/ev-engine'

/** Verdict chip classes on dark vault surfaces. */
export const VERDICT_CHIP: Record<Verdict, string> = {
  'plus-ev-likely': 'border-emerald-700/40 bg-emerald-950/40 text-emerald-300',
  'minus-ev-likely': 'border-red-700/40 bg-red-950/40 text-red-300',
  uncertain: 'border-amber-700/40 bg-amber-950/40 text-amber-300',
  'insufficient-data': 'border-zinc-700/60 bg-zinc-900/60 text-zinc-400',
}

/** Verdict ink on the bone slab-label surface — all ≥4.5:1 on #f2eee3. */
export const VERDICT_INK_ON_SLAB: Record<Verdict, string> = {
  'plus-ev-likely': 'text-emerald-800',
  'minus-ev-likely': 'text-red-800',
  uncertain: 'text-amber-800',
  'insufficient-data': 'text-zinc-600',
}

/** Small solid glyph color matching the verdict, for the slab brand row. */
export const VERDICT_GLYPH_ON_SLAB: Record<Verdict, string> = {
  'plus-ev-likely': 'bg-emerald-700',
  'minus-ev-likely': 'bg-red-700',
  uncertain: 'bg-amber-600',
  'insufficient-data': 'bg-zinc-500',
}

/** Canonical display order for the scenario ladder (rosy → skeptical → data-free contrast). */
export const SCENARIO_ORDER = [
  'as-observed',
  'generous',
  'neutral',
  'house-favored',
  'reference-prior',
] as const

/** Our EV always renders as a range — never a single point (Safety checklist). */
export function packEv(
  ev: { runs: EvRunRow[]; pullCount: number } | undefined,
  priceCents: number,
): { verdict: Verdict; reason: string; headline: EvRunRow | undefined } {
  const runs = ev?.runs ?? []
  const { verdict, reason } = computeVerdict({
    priceCents,
    pullCount: ev?.pullCount ?? 0,
    results: runs.map((r) => ({
      scenario: r.scenario,
      probEvAbovePrice: r.prob_ev_above_price ?? 0,
    })),
  })
  return { verdict, reason, headline: runs.find((r) => r.scenario === HEADLINE_SCENARIO) }
}

/** Sort runs into the canonical scenario order, dropping unknown scenario names. */
export function orderRuns(runs: EvRunRow[]): EvRunRow[] {
  const byScenario = new Map(runs.map((r) => [r.scenario, r]))
  return SCENARIO_ORDER.map((name) => byScenario.get(name)).filter(
    (r): r is EvRunRow => r !== undefined,
  )
}
