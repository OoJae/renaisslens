import type { Database, PackRow, PullRow } from '@renaisslens/db'
import {
  insertEvRun,
  latestPulls,
  listPacks,
  medianAskToFmvRatio,
  openDb,
  runMigrations,
} from '@renaisslens/db'
import type { EvResult, PoolInput } from '@renaisslens/ev-engine'
import {
  buildScenarios,
  computeVerdict,
  HEADLINE_SCENARIO,
  MIN_PULLS_FOR_EV,
  seedFromString,
  simulatePack,
  verdictLabel,
} from '@renaisslens/ev-engine'

export interface EvReport {
  cycleId: string
  sources: { source: string; status: 'ok' | 'failed'; detail: string }[]
}

/**
 * Cap on pulls fed to one EV run. pack_pulls accumulates across polls, so this
 * bounds the window; the pool, pull count, tier summary, and provenance are all
 * derived from these same rows so the assumptions panel describes exactly what ran.
 */
const PULL_FETCH_LIMIT = 500

/**
 * Compute EV ranges for every pack × scenario from CURRENT DB state and
 * persist them to ev_runs. Zero network: this reads only what the scrapers
 * already ingested. Runs are append-only history; reads are latest-per-group.
 *
 * Reproducible by construction: the seed derives from pack, scenario, and the
 * exact input snapshot ids, so the same data state always publishes the same
 * range (METHODOLOGY's reproducibility promise).
 */
export function runEv(opts: { db?: Database; pack?: string; iterations?: number } = {}): EvReport {
  const db = opts.db ?? openDb()
  runMigrations(db)
  const now = new Date().toISOString()
  const reports: EvReport['sources'] = []

  const packs = listPacks(db).filter((p) => opts.pack === undefined || p.slug === opts.pack)
  if (packs.length === 0) {
    // An explicit --pack that doesn't exist is a real error; an implicitly
    // empty DB (e.g. a marketplace-only cycle before any packs land) is a
    // benign skip — reporting it 'failed' would poison the cycle exit code.
    reports.push(
      opts.pack !== undefined
        ? { source: 'ev:(none)', status: 'failed', detail: `unknown pack "${opts.pack}"` }
        : {
            source: 'ev:(none)',
            status: 'ok',
            detail: 'skipped — no packs in DB yet (run api-packs first)',
          },
    )
  }
  const askToFmvMedian = medianAskToFmvRatio(db)

  for (const pack of packs) {
    const source = `ev:${pack.slug}`
    try {
      const pulls = latestPulls(db, pack.slug, PULL_FETCH_LIMIT)
      if (pulls.length < MIN_PULLS_FOR_EV) {
        reports.push({
          source,
          status: 'ok',
          detail: `skipped — insufficient data (${pulls.length} pulls, need ≥${MIN_PULLS_FOR_EV})`,
        })
        continue
      }

      const { pool, snapshotIds, pullSnapshotIds, tierSummary } = buildEngineInput(pack, pulls)
      const scenarios = buildScenarios({
        priceCents: pack.price_cents,
        topPrizeFmvCents: pack.featured_card_fmv_cents,
        renaissClaimedEvCents: pack.expected_value_cents,
        pullCount: pulls.length,
        // derived from the SAME window fed to the engine, so tier_counts sums to
        // observed_pull_count and the assumptions panel matches what actually ran
        tierSummary,
        listingAskToFmvMedian: askToFmvMedian,
        priceSource: `api-packs snapshot #${pack.snapshot_id} @ ${pack.last_seen_at}`,
        pullsSource: `api-pack-detail:${pack.slug} snapshots #${pullSnapshotIds.join(',#')}`,
      })

      const results: EvResult[] = scenarios.map((scenario) =>
        simulatePack({
          packSlug: pack.slug,
          priceCents: pack.price_cents,
          pool,
          scenario,
          seed: seedFromString(`${pack.slug}|${scenario.name}|${snapshotIds.join(',')}`),
          iterations: opts.iterations,
        }),
      )
      const verdict = computeVerdict({
        priceCents: pack.price_cents,
        pullCount: pulls.length,
        results,
      })

      const persist = db.transaction(() => {
        for (const r of results) {
          insertEvRun(
            db,
            {
              packSlug: r.packSlug,
              scenario: r.scenario,
              p10Cents: r.p10Cents,
              p50Cents: r.p50Cents,
              p90Cents: r.p90Cents,
              probBreakEven: r.probBreakEven,
              probTopPrize: r.probTopPrize,
              probEvAbovePrice: r.probEvAbovePrice,
              evMeanCents: r.evMeanCents,
              iterations: r.iterations,
              seed: r.seed,
              paramsJson: JSON.stringify({
                pool: {
                  topPrizeFmvCents: pool.topPrizeFmvCents,
                  tiers: pool.tiers.map((t) => ({ name: t.name, n: t.fmvCents.length })),
                },
                verdict,
                histogram: r.histogram,
                // 'pull' = single-pull values; 'ev' = EV spread (reference-prior)
                // — the UI captions the histogram axis from this
                histogramOf: r.histogramOf,
              }),
              assumptionsJson: JSON.stringify(r.assumptions),
              inputSnapshotIdsJson: JSON.stringify(snapshotIds),
            },
            now,
          )
        }
      })
      persist()

      const headline = results.find((r) => r.scenario === HEADLINE_SCENARIO) ?? results[0]
      const range =
        headline === undefined
          ? 'no scenarios'
          : `${headline.scenario} P10–P90 ${usd(headline.p10Cents)}–${usd(headline.p90Cents)} (P50 ${usd(headline.p50Cents)})`
      reports.push({
        source,
        status: 'ok',
        detail: `${results.length} scenarios · ${range} · verdict: ${verdictLabel(verdict.verdict)}`,
      })
    } catch (err) {
      reports.push({
        source,
        status: 'failed',
        detail: String(err instanceof Error ? err.message : err).slice(0, 300),
      })
    }
  }

  if (opts.db === undefined) db.close()
  return { cycleId: `ev:${now}`, sources: reports }
}

interface EngineInput {
  pool: PoolInput
  /** provenance for the whole run: pack snapshot ∪ pull snapshots, sorted — also seeds the RNG */
  snapshotIds: number[]
  /** the pull rows' snapshots only — the honest source of the observed tier counts */
  pullSnapshotIds: number[]
  /** tier summary from THIS window (not an unbounded all-time query) for the assumptions panel */
  tierSummary: { tier: string; n: number; avgFmvCents: number }[]
}

/**
 * The single adaptation point between DB rows and the engine's input shape.
 * Groups the observed pulls by verbatim tier and derives everything the run
 * publishes — pool, tier summary, and provenance — from the SAME rows, so the
 * assumptions panel can never describe a dataset the model didn't run on.
 *
 * Pool ordering is canonical (tiers by name, values ascending) so the seeded
 * Monte Carlo is independent of SQL row order — the reproducibility promise
 * survives arbitrary tie-breaks in the pull query.
 */
function buildEngineInput(pack: PackRow, pulls: PullRow[]): EngineInput {
  const byTier = new Map<string, number[]>()
  for (const pull of pulls) {
    const values = byTier.get(pull.tier)
    if (values === undefined) byTier.set(pull.tier, [pull.fmv_cents])
    else values.push(pull.fmv_cents)
  }
  const tiers = [...byTier.entries()]
    .map(([name, fmvCents]) => ({ name, fmvCents: [...fmvCents].sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const pullSnapshotIds = [...new Set(pulls.map((p) => p.snapshot_id))].sort((a, b) => a - b)
  const snapshotIds = [...new Set([pack.snapshot_id, ...pullSnapshotIds])].sort((a, b) => a - b)

  return {
    pool: { topPrizeFmvCents: pack.featured_card_fmv_cents, tiers },
    snapshotIds,
    pullSnapshotIds,
    tierSummary: tiers.map((t) => ({
      tier: t.name,
      n: t.fmvCents.length,
      avgFmvCents: Math.round(t.fmvCents.reduce((a, b) => a + b, 0) / t.fmvCents.length),
    })),
  }
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`
