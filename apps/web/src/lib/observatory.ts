import type { ObservatoryPullRow, PackRow } from '@renaisslens/db'
import {
  bootstrapMeanCI,
  MIN_PULLS_FOR_EV,
  type ProportionInterval,
  wilsonInterval,
} from '@renaisslens/ev-engine'

/**
 * Pure reduction behind the fairness observatory. Turns raw observed pulls +
 * pack metadata into per-tier empirical frequencies (with Wilson CIs) and a
 * bootstrap CI on the observed mean realized FMV. Everything here describes the
 * OBSERVED feed — never Renaiss's true odds, which are unknown.
 */

export interface TierFrequency {
  tier: string
  n: number
  /** Observed share of this pack's pulls, with a 95% Wilson interval. */
  proportion: ProportionInterval
  meanFmvCents: number
  minFmvCents: number
  maxFmvCents: number
}

export interface ObservatoryPack {
  slug: string
  name: string
  priceCents: number
  /** Renaiss's single claimed EV — shown for contrast, never used to compute anything. */
  claimedEvCents: number | null
  featuredCardFmvCents: number | null
  totalPulls: number
  /** True once totalPulls ≥ the same threshold the EV verdict uses. */
  sufficient: boolean
  tiers: TierFrequency[]
  /** Mean realized pull FMV + a seeded 95% bootstrap CI (null when no pulls). */
  observedMean: { mean: number; lo: number; hi: number } | null
}

/** Group raw pulls by pack and derive the observatory view. Deterministic + pure. */
export function buildObservatory(
  packs: readonly PackRow[],
  pulls: readonly ObservatoryPullRow[],
): ObservatoryPack[] {
  // slug → { tier → fmv_cents[] }, insertion order preserved from the id-sorted query
  const byPack = new Map<string, Map<string, number[]>>()
  const flatByPack = new Map<string, number[]>()
  for (const pull of pulls) {
    let tiers = byPack.get(pull.pack_slug)
    if (tiers === undefined) {
      tiers = new Map()
      byPack.set(pull.pack_slug, tiers)
      flatByPack.set(pull.pack_slug, [])
    }
    const bucket = tiers.get(pull.tier)
    if (bucket === undefined) tiers.set(pull.tier, [pull.fmv_cents])
    else bucket.push(pull.fmv_cents)
    flatByPack.get(pull.pack_slug)?.push(pull.fmv_cents)
  }

  return packs.map((pack) => {
    const tierMap = byPack.get(pack.slug) ?? new Map<string, number[]>()
    const flat = flatByPack.get(pack.slug) ?? []
    const total = flat.length

    const tiers: TierFrequency[] = [...tierMap.entries()]
      .map(([tier, fmvs]) => ({
        tier,
        n: fmvs.length,
        proportion: wilsonInterval(fmvs.length, total),
        meanFmvCents: Math.round(fmvs.reduce((a, b) => a + b, 0) / fmvs.length),
        minFmvCents: Math.min(...fmvs),
        maxFmvCents: Math.max(...fmvs),
      }))
      // observed FMV, descending — a within-pack ordering, never a claimed rank
      .sort((a, b) => b.meanFmvCents - a.meanFmvCents)

    // seed off the data state so the published CI is reproducible run-to-run
    const observedMean =
      total > 0
        ? (() => {
            const ci = bootstrapMeanCI(flat, { seed: `${pack.slug}|observed-mean|${total}` })
            return { mean: ci.mean, lo: ci.lo, hi: ci.hi }
          })()
        : null

    return {
      slug: pack.slug,
      name: pack.name,
      priceCents: pack.price_cents,
      claimedEvCents: pack.expected_value_cents,
      featuredCardFmvCents: pack.featured_card_fmv_cents,
      totalPulls: total,
      sufficient: total >= MIN_PULLS_FOR_EV,
      tiers,
      observedMean,
    }
  })
}
