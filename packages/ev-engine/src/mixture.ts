import type { Assumption, EvScenario } from './types'

/**
 * Everything the engine knows about a pack's pool: observed pull FMVs grouped
 * by verbatim tier label, plus the pack's advertised top prize. The top prize
 * is deliberately NOT a tier — no pull has ever been observed to reach it, so
 * its probability is an assumption, never an inference.
 */
export interface PoolInput {
  topPrizeFmvCents: number | null
  tiers: { name: string; fmvCents: number[] }[]
}

export type ModelFamily = 'tiered-mixture' | 'reference-prior'

export interface MixtureParams {
  feedHitBiasFactor: number
  fmvHaircut: number
  topPrizeOddsLo: number
  topPrizeOddsHi: number
  tierPriorPseudocount: number
  hitTierThresholdXPrice: number
}

export interface ReferencePriorParams {
  holdLo: number
  holdHi: number
}

/**
 * Scenario parameters travel INSIDE the Assumption list under these names, so
 * the assumptions panel always renders exactly the parameters the engine ran —
 * there is no second, hidden parameter channel.
 */
export const PARAM = {
  modelFamily: 'model_family',
  feedHitBiasFactor: 'feed_hit_bias_factor',
  fmvHaircut: 'fmv_haircut',
  topPrizeOddsLo: 'top_prize_odds_lo',
  topPrizeOddsHi: 'top_prize_odds_hi',
  tierPriorPseudocount: 'tier_prior_pseudocount',
  hitTierThresholdXPrice: 'hit_tier_threshold_x_price',
  referenceHoldLo: 'reference_hold_lo',
  referenceHoldHi: 'reference_hold_hi',
} as const

function findAssumption(assumptions: Assumption[], name: string): Assumption | undefined {
  return assumptions.find((a) => a.name === name)
}

function numericParam(scenario: EvScenario, name: string): number {
  const a = findAssumption(scenario.assumptions, name)
  if (a === undefined || typeof a.value !== 'number' || !Number.isFinite(a.value)) {
    throw new Error(`scenario "${scenario.name}": missing or non-numeric assumption "${name}"`)
  }
  return a.value
}

export function modelFamilyOf(scenario: EvScenario): ModelFamily {
  const a = findAssumption(scenario.assumptions, PARAM.modelFamily)
  if (a === undefined || (a.value !== 'tiered-mixture' && a.value !== 'reference-prior')) {
    throw new Error(
      `scenario "${scenario.name}": assumption "${PARAM.modelFamily}" must be 'tiered-mixture' or 'reference-prior'`,
    )
  }
  return a.value
}

export function parseMixtureParams(scenario: EvScenario): MixtureParams {
  const params: MixtureParams = {
    feedHitBiasFactor: numericParam(scenario, PARAM.feedHitBiasFactor),
    fmvHaircut: numericParam(scenario, PARAM.fmvHaircut),
    topPrizeOddsLo: numericParam(scenario, PARAM.topPrizeOddsLo),
    topPrizeOddsHi: numericParam(scenario, PARAM.topPrizeOddsHi),
    tierPriorPseudocount: numericParam(scenario, PARAM.tierPriorPseudocount),
    hitTierThresholdXPrice: numericParam(scenario, PARAM.hitTierThresholdXPrice),
  }
  if (params.feedHitBiasFactor < 1) {
    throw new Error(`scenario "${scenario.name}": ${PARAM.feedHitBiasFactor} must be >= 1`)
  }
  if (params.fmvHaircut <= 0 || params.fmvHaircut > 1) {
    throw new Error(`scenario "${scenario.name}": ${PARAM.fmvHaircut} must be in (0, 1]`)
  }
  if (
    params.topPrizeOddsLo < 0 ||
    params.topPrizeOddsHi < params.topPrizeOddsLo ||
    params.topPrizeOddsHi >= 1
  ) {
    throw new Error(
      `scenario "${scenario.name}": top-prize odds band must satisfy 0 <= lo <= hi < 1`,
    )
  }
  if (params.tierPriorPseudocount <= 0) {
    throw new Error(`scenario "${scenario.name}": ${PARAM.tierPriorPseudocount} must be > 0`)
  }
  if (params.hitTierThresholdXPrice <= 0) {
    throw new Error(`scenario "${scenario.name}": ${PARAM.hitTierThresholdXPrice} must be > 0`)
  }
  return params
}

export function parseReferencePriorParams(scenario: EvScenario): ReferencePriorParams {
  const holdLo = numericParam(scenario, PARAM.referenceHoldLo)
  const holdHi = numericParam(scenario, PARAM.referenceHoldHi)
  if (holdLo < 0 || holdHi < holdLo || holdHi >= 1) {
    throw new Error(
      `scenario "${scenario.name}": reference hold band must satisfy 0 <= lo <= hi < 1`,
    )
  }
  return { holdLo, holdHi }
}

export interface TierStats {
  name: string
  values: number[]
  count: number
  meanCents: number
  /** hit tier = mean FMV >= threshold × pack price; its concentration is bias-divided */
  isHit: boolean
  /** Dirichlet concentration: (count + pseudo-count), ÷ β for hit tiers */
  alpha: number
}

export function buildTierStats(
  pool: PoolInput,
  priceCents: number,
  params: MixtureParams,
): TierStats[] {
  if (pool.tiers.length === 0) throw new Error('pool has no tiers — nothing observed to model')
  return pool.tiers.map((tier) => {
    if (tier.fmvCents.length === 0) {
      throw new Error(`tier "${tier.name}" has no observed values`)
    }
    const mean = tier.fmvCents.reduce((acc, v) => acc + v, 0) / tier.fmvCents.length
    const isHit = mean >= params.hitTierThresholdXPrice * priceCents
    // Down-weight a hit tier by dividing its FULL concentration (count +
    // pseudocount) by β, not just the count. Dividing only the count lets the
    // undivided pseudocount dominate as β grows, which can perversely RAISE a
    // hit tier's relative weight when every tier is a hit. Scaling the whole
    // alpha keeps β a pure skepticism knob: raising it never raises EV.
    const baseAlpha = tier.fmvCents.length + params.tierPriorPseudocount
    return {
      name: tier.name,
      values: tier.fmvCents,
      count: tier.fmvCents.length,
      meanCents: mean,
      isHit,
      alpha: isHit ? baseAlpha / params.feedHitBiasFactor : baseAlpha,
    }
  })
}
