import {
  buildTierStats,
  modelFamilyOf,
  type PoolInput,
  parseMixtureParams,
  parseReferencePriorParams,
} from './mixture'
import { mulberry32 } from './rng'
import { dirichlet, logUniform, uniform } from './samplers'
import type { EvResult, EvScenario, HistogramBin } from './types'

export interface SimulateInput {
  packSlug: string
  priceCents: number
  pool: PoolInput
  scenario: EvScenario
  seed: number
  iterations?: number
}

/**
 * Two-layer Monte Carlo pack EV simulation.
 *
 * Outer layer — parameter uncertainty: every iteration redraws the odds
 * themselves (tier weights from a Dirichlet posterior over bias-adjusted pull
 * counts, tier means by bootstrap, top-prize probability from its assumed
 * band) and computes that draw's exact EV. p10/p50/p90 are percentiles of
 * this EV distribution: a credible range for the pack's expected payout.
 *
 * Inner layer — pull luck: each iteration also simulates one pull from the
 * same parameter draw, giving the posterior-predictive histogram,
 * P(pull >= price) and P(top prize).
 *
 * Deterministic: same input + seed → identical result, bit for bit.
 */
export function simulatePack(input: SimulateInput): EvResult {
  const iterations = input.iterations ?? 100_000
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`iterations must be a positive integer, got ${iterations}`)
  }
  if (!Number.isFinite(input.priceCents) || input.priceCents <= 0) {
    throw new Error(`priceCents must be > 0, got ${input.priceCents}`)
  }
  const family = modelFamilyOf(input.scenario)
  return family === 'tiered-mixture'
    ? simulateMixture(input, iterations)
    : simulateReferencePrior(input, iterations)
}

function simulateMixture(input: SimulateInput, iterations: number): EvResult {
  const params = parseMixtureParams(input.scenario)
  const tiers = buildTierStats(input.pool, input.priceCents, params)
  const topPrize = input.pool.topPrizeFmvCents
  const topOn = params.topPrizeOddsHi > 0
  if (topOn && (topPrize === null || topPrize <= 0)) {
    throw new Error(
      `scenario "${input.scenario.name}" assumes top-prize odds but the pool has no top-prize value`,
    )
  }
  const rng = mulberry32(input.seed)
  const alphas = tiers.map((t) => t.alpha)
  const evSamples = new Float64Array(iterations)
  const pullSamples = new Float64Array(iterations)
  let breakEvenHits = 0
  let topHits = 0
  let evAbovePrice = 0

  for (let j = 0; j < iterations; j++) {
    const pTop = topOn ? logUniform(params.topPrizeOddsLo, params.topPrizeOddsHi, rng) : 0
    const weights = dirichlet(alphas, rng)
    let mixtureMean = 0
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i]
      const weight = weights[i]
      if (tier === undefined || weight === undefined) continue
      mixtureMean += weight * bootstrapMean(tier.values, rng)
    }
    const ev = params.fmvHaircut * (pTop * (topPrize ?? 0) + (1 - pTop) * mixtureMean)
    evSamples[j] = ev
    if (ev > input.priceCents) evAbovePrice++

    // one posterior-predictive pull from the same parameter draw
    let pull: number
    if (topOn && rng() < pTop) {
      pull = topPrize ?? 0
      topHits++
    } else {
      const tier = tiers[categorical(weights, rng)]
      pull = tier?.values[Math.floor(rng() * tier.values.length)] ?? 0
    }
    pull *= params.fmvHaircut
    pullSamples[j] = pull
    if (pull >= input.priceCents) breakEvenHits++
  }

  const evMean = mean(evSamples)
  evSamples.sort()
  return {
    packSlug: input.packSlug,
    scenario: input.scenario.name,
    p10Cents: Math.round(quantileSorted(evSamples, 0.1)),
    p50Cents: Math.round(quantileSorted(evSamples, 0.5)),
    p90Cents: Math.round(quantileSorted(evSamples, 0.9)),
    probBreakEven: breakEvenHits / iterations,
    probTopPrize: topHits / iterations,
    probEvAbovePrice: evAbovePrice / iterations,
    evMeanCents: Math.round(evMean),
    iterations,
    seed: input.seed,
    assumptions: input.scenario.assumptions,
    histogram: buildHistogram(pullSamples),
    histogramOf: 'pull',
  }
}

/**
 * The data-free contrast scenario: ignore our pulls entirely and apply the
 * reference-class house-edge band — EV = price × (1 − hold). Single-pull
 * stats are not modeled here (there is no pool shape to model); the histogram
 * shows the EV spread itself.
 */
function simulateReferencePrior(input: SimulateInput, iterations: number): EvResult {
  const { holdLo, holdHi } = parseReferencePriorParams(input.scenario)
  const rng = mulberry32(input.seed)
  const evSamples = new Float64Array(iterations)
  let evAbovePrice = 0
  for (let j = 0; j < iterations; j++) {
    const ev = input.priceCents * (1 - uniform(holdLo, holdHi, rng))
    evSamples[j] = ev
    if (ev > input.priceCents) evAbovePrice++
  }
  const evMean = mean(evSamples)
  evSamples.sort()
  return {
    packSlug: input.packSlug,
    scenario: input.scenario.name,
    p10Cents: Math.round(quantileSorted(evSamples, 0.1)),
    p50Cents: Math.round(quantileSorted(evSamples, 0.5)),
    p90Cents: Math.round(quantileSorted(evSamples, 0.9)),
    // reference-prior models no individual pull — these are honestly "not modeled", not 0
    probBreakEven: null,
    probTopPrize: null,
    probEvAbovePrice: evAbovePrice / iterations,
    evMeanCents: Math.round(evMean),
    iterations,
    seed: input.seed,
    assumptions: input.scenario.assumptions,
    histogram: buildHistogram(evSamples),
    histogramOf: 'ev',
  }
}

function mean(values: Float64Array): number {
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** Mean of n draws with replacement — within-tier value uncertainty. */
function bootstrapMean(values: number[], rng: () => number): number {
  const n = values.length
  if (n === 1) return values[0] ?? 0
  let sum = 0
  for (let k = 0; k < n; k++) sum += values[Math.floor(rng() * n)] ?? 0
  return sum / n
}

function categorical(weights: number[], rng: () => number): number {
  const u = rng()
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] ?? 0
    if (u < acc) return i
  }
  return weights.length - 1 // float round-off guard
}

/** Type-7 (linear interpolation) quantile of an ascending-sorted array. */
export function quantileSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length
  if (n === 0) throw new Error('quantileSorted: empty array')
  const idx = (n - 1) * p
  const loIdx = Math.floor(idx)
  const lo = sorted[loIdx]
  const hi = sorted[Math.ceil(idx)]
  if (lo === undefined || hi === undefined) throw new Error('quantileSorted: index out of range')
  return lo + (hi - lo) * (idx - loIdx)
}

const HISTOGRAM_BINS = 30

/** ~30 log-spaced bins (linear fallback when values touch zero). */
export function buildHistogram(values: Float64Array, bins = HISTOGRAM_BINS): HistogramBin[] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) return []
  if (min === max)
    return [{ loCents: Math.round(min), hiCents: Math.round(max), count: values.length }]

  const logScale = min > 0
  const edge = (k: number): number =>
    logScale ? min * (max / min) ** (k / bins) : min + ((max - min) * k) / bins
  const counts = new Array<number>(bins).fill(0)
  const logMin = logScale ? Math.log(min) : 0
  const logSpan = logScale ? Math.log(max) - Math.log(min) : 0
  for (const v of values) {
    const t = logScale ? (Math.log(v) - logMin) / logSpan : (v - min) / (max - min)
    const i = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)))
    counts[i] = (counts[i] ?? 0) + 1
  }
  return counts.map((count, k) => ({
    loCents: Math.round(edge(k)),
    hiCents: Math.round(edge(k + 1)),
    count,
  }))
}
