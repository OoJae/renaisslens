import { PARAM } from './mixture'
import type { Assumption, EvScenario } from './types'

/** The scenario whose range headlines the pack card. */
export const HEADLINE_SCENARIO = 'neutral'
/** The scenarios the verdict rule consults — never the display-only contrasts. */
export const VERDICT_SCENARIOS = ['generous', 'neutral', 'house-favored'] as const

export interface ScenarioInputs {
  priceCents: number
  topPrizeFmvCents: number | null
  /** Renaiss's own published EV claim — carried for the panel, never used by the model. */
  renaissClaimedEvCents: number | null
  pullCount: number
  tierSummary: { tier: string; n: number; avgFmvCents: number }[]
  /** inter-poll overlap: evidence for/against feed completeness (METHODOLOGY limitation #1) */
  feedOverlapRatio?: number | null
  /** median ask/FMV across marketplace listings — context motivating the haircut, nothing more */
  listingAskToFmvMedian?: number | null
  /** provenance strings rendered in the assumptions panel, e.g. 'api-packs snapshot #4 @ 2026-07-03T…' */
  priceSource?: string
  pullsSource?: string
}

const REFERENCE_CLASS_SOURCE =
  'reference class: comparable graded-card gacha products imply a sustainable 10–40% house edge'

/**
 * The canonical five scenarios. Each is nothing but a named list of labeled
 * assumptions — the engine reads its parameters back out of that list, so the
 * assumptions panel is guaranteed to show exactly what ran.
 *
 * The gap between `as-observed` and `house-favored` IS the product: it shows
 * how much of a pack's apparent EV survives increasingly skeptical readings
 * of the same public data.
 */
export function buildScenarios(input: ScenarioInputs): EvScenario[] {
  const observed = observedAssumptions(input)
  const inferred = inferredAssumptions(input)
  // No positive featured-card FMV → there is no top-prize value to model, so
  // the odds channel is switched OFF (band [0,0]). The parameter still appears
  // in the panel — its source explains why — so what ran stays fully visible.
  const hasTopPrize = input.topPrizeFmvCents !== null && input.topPrizeFmvCents > 0
  const TOP_PRIZE_OFF_SOURCE =
    'no positive featured-card FMV published for this pack — top-prize channel disabled'

  const mixture = (
    name: string,
    rationale: string,
    beta: number,
    haircut: number,
    oddsLo: number,
    oddsHi: number,
  ): EvScenario => ({
    name,
    assumptions: [
      ...observed,
      ...inferred,
      assumed(PARAM.modelFamily, 'tiered-mixture', rationale),
      assumed(
        PARAM.feedHitBiasFactor,
        beta,
        'feed completeness unknown (METHODOLOGY limitations #1, #5) — hit-tier counts divided by this factor',
      ),
      assumed(
        PARAM.hitTierThresholdXPrice,
        1.5,
        'a tier counts as a "hit" when its mean FMV is ≥ 1.5× pack price',
      ),
      assumed(
        PARAM.topPrizeOddsLo,
        hasTopPrize ? oddsLo : 0,
        hasTopPrize ? REFERENCE_CLASS_SOURCE : TOP_PRIZE_OFF_SOURCE,
      ),
      assumed(
        PARAM.topPrizeOddsHi,
        hasTopPrize ? oddsHi : 0,
        hasTopPrize ? REFERENCE_CLASS_SOURCE : TOP_PRIZE_OFF_SOURCE,
      ),
      assumed(
        PARAM.fmvHaircut,
        haircut,
        'FMV is Renaiss’s own valuation (METHODOLOGY limitation #4); realizable value is likely lower',
      ),
      assumed(
        PARAM.tierPriorPseudocount,
        0.5,
        'Jeffreys-style smoothing so small samples widen, not sharpen, the range',
      ),
    ],
  })

  const referencePrior: EvScenario = {
    name: 'reference-prior',
    assumptions: [
      ...observed,
      ...inferred,
      assumed(
        PARAM.modelFamily,
        'reference-prior',
        'contrast scenario: ignores our pull data entirely — EV = price × (1 − hold)',
      ),
      assumed(PARAM.referenceHoldLo, 0.1, REFERENCE_CLASS_SOURCE),
      assumed(PARAM.referenceHoldHi, 0.4, REFERENCE_CLASS_SOURCE),
    ],
  }

  return [
    mixture(
      'as-observed',
      'naive baseline: the public pull feed taken at face value — likely too rosy; display only',
      1,
      1.0,
      0,
      0,
    ),
    mixture(
      'generous',
      'feed complete and unbiased, FMV fully realizable',
      1,
      1.0,
      1 / 1000,
      1 / 500,
    ),
    mixture(
      'neutral',
      'mild feed curation, modest haircut — the headline scenario',
      2,
      0.9,
      1 / 3000,
      1 / 1000,
    ),
    mixture(
      'house-favored',
      'feed curated toward hits, conservative realizable value — consistent with the 10–40% reference-class hold band',
      5,
      0.8,
      1 / 10_000,
      1 / 3000,
    ),
    referencePrior,
  ]
}

function observedAssumptions(input: ScenarioInputs): Assumption[] {
  const priceSource = input.priceSource ?? 'api.renaiss.xyz /v0/packs'
  const pullsSource = input.pullsSource ?? 'api.renaiss.xyz /v0/packs/{slug} recentOpenedPacks'
  const out: Assumption[] = [
    {
      name: 'pack_price_cents',
      value: input.priceCents,
      source: priceSource,
      confidence: 'observed',
    },
    {
      name: 'observed_pull_count',
      value: input.pullCount,
      source: pullsSource,
      confidence: 'observed',
    },
  ]
  if (input.topPrizeFmvCents !== null) {
    out.push({
      name: 'top_prize_fmv_cents',
      value: input.topPrizeFmvCents,
      source: `${priceSource} featured card (FMV is Renaiss’s own valuation)`,
      confidence: 'observed',
    })
  }
  if (input.renaissClaimedEvCents !== null) {
    out.push({
      name: 'renaiss_claimed_ev_cents',
      value: input.renaissClaimedEvCents,
      source: `${priceSource} (Renaiss’s claim — tracked for contrast, never used by the model)`,
      confidence: 'observed',
    })
  }
  if (input.tierSummary.length > 0) {
    out.push(
      {
        name: 'tier_counts',
        value: input.tierSummary.map((t) => `${t.tier}:${t.n}`).join(' '),
        source: pullsSource,
        confidence: 'observed',
      },
      {
        name: 'tier_mean_fmv_cents',
        value: input.tierSummary.map((t) => `${t.tier}:${t.avgFmvCents}`).join(' '),
        source: pullsSource,
        confidence: 'observed',
      },
    )
  }
  return out
}

function inferredAssumptions(input: ScenarioInputs): Assumption[] {
  const out: Assumption[] = []
  if (input.feedOverlapRatio !== undefined && input.feedOverlapRatio !== null) {
    out.push({
      name: 'feed_overlap_ratio',
      value: round4(input.feedOverlapRatio),
      source:
        'inter-poll overlap of the pull feed — evidence on feed completeness (METHODOLOGY limitation #1)',
      confidence: 'inferred',
    })
  }
  if (input.listingAskToFmvMedian !== undefined && input.listingAskToFmvMedian !== null) {
    out.push({
      name: 'listing_ask_to_fmv_median',
      value: round4(input.listingAskToFmvMedian),
      source:
        'marketplace listings with both ask and FMV — context for the haircut assumption only',
      confidence: 'inferred',
    })
  }
  return out
}

const assumed = (name: string, value: string | number, source: string): Assumption => ({
  name,
  value,
  source,
  confidence: 'assumed',
})

const round4 = (x: number): number => Math.round(x * 10_000) / 10_000
