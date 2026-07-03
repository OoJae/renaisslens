import type { EvResult } from './types'

/**
 * Below this many observed pulls we refuse to publish a range at all —
 * "insufficient data" is a first-class verdict, never a fabricated estimate.
 */
export const MIN_PULLS_FOR_EV = 20

export type Verdict = 'plus-ev-likely' | 'minus-ev-likely' | 'uncertain' | 'insufficient-data'

export interface VerdictInput {
  priceCents: number
  pullCount: number
  results: Pick<EvResult, 'scenario' | 'probEvAbovePrice'>[]
}

/**
 * The badge rule. Deliberately asymmetric-conservative: +EV requires the
 * neutral read to be confident AND the house-favored read to not contradict
 * it; −EV requires the neutral read to be confident AND even the generous
 * read to agree. Everything in between is 'uncertain' — overclaiming loses
 * the Safety criterion.
 */
export function computeVerdict(input: VerdictInput): { verdict: Verdict; reason: string } {
  if (input.pullCount < MIN_PULLS_FOR_EV) {
    return {
      verdict: 'insufficient-data',
      reason: `only ${input.pullCount} observed pulls (need ≥${MIN_PULLS_FOR_EV})`,
    }
  }
  const byScenario = new Map(input.results.map((r) => [r.scenario, r]))
  const neutral = byScenario.get('neutral')
  const houseFavored = byScenario.get('house-favored')
  const generous = byScenario.get('generous')
  if (neutral === undefined || houseFavored === undefined || generous === undefined) {
    return {
      verdict: 'insufficient-data',
      reason: 'missing verdict scenarios (need generous, neutral, house-favored)',
    }
  }
  const pct = (p: number) => `${Math.round(p * 100)}%`
  if (neutral.probEvAbovePrice >= 0.8 && houseFavored.probEvAbovePrice >= 0.5) {
    return {
      verdict: 'plus-ev-likely',
      reason: `P(EV > price) = ${pct(neutral.probEvAbovePrice)} neutral, ${pct(houseFavored.probEvAbovePrice)} house-favored`,
    }
  }
  if (neutral.probEvAbovePrice <= 0.2 && generous.probEvAbovePrice <= 0.5) {
    return {
      verdict: 'minus-ev-likely',
      reason: `P(EV > price) = ${pct(neutral.probEvAbovePrice)} neutral, ${pct(generous.probEvAbovePrice)} generous`,
    }
  }
  return {
    verdict: 'uncertain',
    reason: `P(EV > price) = ${pct(generous.probEvAbovePrice)} generous / ${pct(neutral.probEvAbovePrice)} neutral / ${pct(houseFavored.probEvAbovePrice)} house-favored — scenarios disagree`,
  }
}

/** Human badge text. */
export function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case 'plus-ev-likely':
      return '+EV likely'
    case 'minus-ev-likely':
      return '−EV likely'
    case 'uncertain':
      return 'uncertain'
    case 'insufficient-data':
      return 'insufficient data'
  }
}
