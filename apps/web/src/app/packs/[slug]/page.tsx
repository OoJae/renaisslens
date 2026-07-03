import {
  countPullsForPack,
  type Database,
  type DataMode,
  type EvRunRow,
  getDataMode,
  getMeta,
  latestEvRuns,
  latestPulls,
  listPacks,
  openDb,
  type PackRow,
  type PullRow,
  type TierBucket,
  tierDistribution,
} from '@renaisslens/db'
import {
  type Assumption,
  HEADLINE_SCENARIO,
  type HistogramBin,
  MIN_PULLS_FOR_EV,
  type Verdict,
} from '@renaisslens/ev-engine'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AssumptionsPanel } from '@/components/assumptions-panel'
import { MonteCarloHistogram, type ScenarioHistogramData } from '@/components/monte-carlo-histogram'
import { SensitivityTable } from '@/components/sensitivity-table'
import { SlabBadge } from '@/components/slab-badge'
import { usd } from '@/lib/format'
import { orderRuns, packEv } from '@/lib/verdict-ui'

export const dynamic = 'force-dynamic'

interface ScenarioRun {
  row: EvRunRow
  histogram: HistogramBin[] | null
  histogramOf: 'pull' | 'ev' | null
  assumptions: Assumption[] | null
}

type PackDetailResult =
  | { kind: 'no-db' }
  | { kind: 'unknown' }
  | {
      kind: 'ok'
      pack: PackRow
      runs: ScenarioRun[]
      verdict: Verdict
      reason: string
      pullCount: number
      recentPulls: PullRow[]
      tiers: TierBucket[]
      mode: DataMode
      capturedAt: string | null
    }

/** Defensive JSON.parse — persisted blobs must degrade to section fallbacks, never crash a page. */
function parseJson<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function parseHistogram(value: unknown): HistogramBin[] | null {
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

function parseAssumptions(raw: string): Assumption[] | null {
  const value = parseJson<unknown>(raw)
  if (!Array.isArray(value)) return null
  const rows = value.filter(
    (a): a is Assumption =>
      typeof a === 'object' && a !== null && typeof (a as Assumption).name === 'string',
  )
  return rows.length > 0 ? rows : null
}

function toScenarioRun(row: EvRunRow): ScenarioRun {
  const params = parseJson<{ histogram?: unknown; histogramOf?: unknown }>(row.params_json)
  const of = params?.histogramOf
  return {
    row,
    histogram: parseHistogram(params?.histogram),
    histogramOf: of === 'pull' || of === 'ev' ? of : null,
    assumptions: parseAssumptions(row.assumptions_json),
  }
}

function readPackDetail(slug: string): PackDetailResult {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    const pack = listPacks(db).find((p) => p.slug === slug)
    if (pack === undefined) return { kind: 'unknown' }
    let evRuns: EvRunRow[] = []
    try {
      evRuns = latestEvRuns(db)
    } catch {
      evRuns = [] // pre-0002 schema → "no EV yet", not a blank page
    }
    const runs = orderRuns(evRuns.filter((r) => r.pack_slug === slug)).map(toScenarioRun)
    const pullCount = countPullsForPack(db, slug)
    const { verdict, reason } = packEv(
      { runs: runs.map((r) => r.row), pullCount },
      pack.price_cents,
    )
    return {
      kind: 'ok',
      pack,
      runs,
      verdict,
      reason,
      pullCount,
      recentPulls: latestPulls(db, slug, 10),
      tiers: tierDistribution(db, slug),
      mode: getDataMode(db),
      capturedAt: getMeta(db, 'demo_captured_at'),
    }
  } catch {
    return { kind: 'no-db' }
  } finally {
    db?.close()
  }
}

export default function PackDetail({ params }: { params: { slug: string } }) {
  const result = readPackDetail(params.slug)
  if (result.kind === 'unknown') notFound()
  if (result.kind === 'no-db') {
    return (
      <p className="text-zinc-400">
        No data yet — run <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
        <code className="text-prism">pnpm scrape</code> (live), then reload.
      </p>
    )
  }
  const { pack, runs, verdict, reason, pullCount, recentPulls, tiers, mode, capturedAt } = result
  const neutral = runs.find((r) => r.row.scenario === HEADLINE_SCENARIO)
  const insufficient = runs.length === 0 || pullCount < MIN_PULLS_FOR_EV

  return (
    <div className="space-y-10">
      <nav aria-label="Breadcrumb">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← All packs
        </Link>
      </nav>

      {mode === 'mock' && (
        <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Sample data mode — showing committed snapshots
          {capturedAt ? ` captured ${capturedAt}` : ''}. Run <code>pnpm scrape</code> for live data.
        </div>
      )}

      <section className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold text-zinc-50">{pack.name}</h2>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded border border-vault-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-400">
              {pack.pack_type}
            </span>
            <span className="rounded border border-vault-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-400">
              {pack.stage}
            </span>
          </div>
          <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-zinc-100">
            {usd(pack.price_cents)}
          </p>
          {pack.description && (
            <p className="mt-2 max-w-md text-sm text-zinc-400">{pack.description}</p>
          )}
        </div>
        <SlabBadge
          verdict={verdict}
          reason={reason}
          size="detail"
          cert={
            neutral !== undefined
              ? {
                  seed: neutral.row.seed,
                  iterations: neutral.row.iterations,
                  ranAt: neutral.row.ran_at,
                }
              : undefined
          }
        />
      </section>

      {insufficient ? (
        <section className="rounded border border-vault-700 bg-vault-900/60 p-4 text-sm text-zinc-300">
          <h3 className="mb-2 font-display text-base font-semibold text-zinc-100">
            Why no EV range?
          </h3>
          <p>
            RenaissLens refuses to publish an EV range below {MIN_PULLS_FOR_EV} observed pulls —
            this pack has {pullCount}. Insufficient data is a verdict, not a bug: fabricating a
            range from thin observations would be less honest than saying we don&apos;t know yet.
            The range appears automatically once the public pull feed shows enough outcomes.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h3 className="mb-3 font-display text-lg font-medium text-zinc-100">
              Monte Carlo outcome distribution
            </h3>
            <MonteCarloHistogram
              scenarios={runs.map(
                (r): ScenarioHistogramData => ({
                  scenario: r.row.scenario,
                  bins: r.histogram ?? [],
                  p10Cents: r.row.p10_cents,
                  p50Cents: r.row.p50_cents,
                  p90Cents: r.row.p90_cents,
                  probEvAbovePrice: r.row.prob_ev_above_price,
                  histogramOf: r.histogramOf,
                  iterations: r.row.iterations,
                }),
              )}
              priceCents={pack.price_cents}
              initialScenario={HEADLINE_SCENARIO}
            />
          </section>

          <section>
            <h3 className="mb-3 font-display text-lg font-medium text-zinc-100">
              Sensitivity — the same data under skeptical assumptions
            </h3>
            <SensitivityTable
              rows={runs.map((r) => ({ run: r.row, assumptions: r.assumptions }))}
            />
            <p className="mt-2 text-xs text-zinc-500">
              The verdict only reads +/−EV when the skeptical scenarios agree; the histogram
              scenario is selectable above.
            </p>
          </section>

          <section>
            <h3 className="mb-3 font-display text-lg font-medium text-zinc-100">
              Assumptions — every input, its source, its confidence
            </h3>
            {neutral?.assumptions ? (
              <>
                <AssumptionsPanel assumptions={neutral.assumptions} />
                <p className="mt-2 text-xs text-zinc-500">
                  Neutral-scenario inputs shown; the per-scenario knobs are in the sensitivity
                  table. FMV figures are Renaiss&apos;s own valuations (see METHODOLOGY.md).
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">No assumptions recorded for this run.</p>
            )}
          </section>
        </>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-vault-700 p-3">
          <h3 className="mb-2 font-display text-sm font-medium text-zinc-200">
            Recent observed pulls
          </h3>
          {recentPulls.length === 0 ? (
            <p className="text-xs text-zinc-500">No pulls observed yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-zinc-400">
              {recentPulls.map((pull) => (
                <li key={pull.id} className="flex justify-between tabular-nums">
                  <span>
                    tier <span className="text-prism">{pull.tier}</span> ·{' '}
                    {new Date(pull.pulled_at * 1000).toISOString().slice(0, 16).replace('T', ' ')}
                  </span>
                  <span>{usd(pull.fmv_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded border border-vault-700 p-3">
          <h3 className="mb-2 font-display text-sm font-medium text-zinc-200">
            Observed tier distribution
          </h3>
          {tiers.length === 0 ? (
            <p className="text-xs text-zinc-500">No tier data yet.</p>
          ) : (
            <table className="w-full text-xs">
              <caption className="sr-only">Pull counts and FMV ranges per tier</caption>
              <thead className="text-left text-zinc-500">
                <tr>
                  <th scope="col" className="py-1">
                    Tier
                  </th>
                  <th scope="col" className="py-1 text-right">
                    n
                  </th>
                  <th scope="col" className="py-1 text-right">
                    avg FMV
                  </th>
                  <th scope="col" className="py-1 text-right">
                    min–max
                  </th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {tiers.map((t) => (
                  <tr key={t.tier} className="border-t border-vault-800">
                    <td className="py-1 text-prism">{t.tier}</td>
                    <td className="py-1 text-right tabular-nums">{t.n}</td>
                    <td className="py-1 text-right tabular-nums">{usd(t.avg_fmv_cents)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {usd(t.min_fmv_cents)}–{usd(t.max_fmv_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {neutral !== undefined && (
        <footer className="border-t border-vault-800 pt-3 font-mono text-[11px] text-zinc-500">
          provenance: snapshots {neutral.row.input_snapshot_ids ?? '—'} · seed{' '}
          {neutral.row.seed ?? '—'} · {neutral.row.iterations ?? '—'} iterations · ran{' '}
          {neutral.row.ran_at} · data mode: {mode}
        </footer>
      )}
    </div>
  )
}
