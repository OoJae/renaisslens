import {
  countPullsForPack,
  type Database,
  type EvRunRow,
  getDataMode,
  getFreshness,
  getMeta,
  latestEvRuns,
  latestPulls,
  listPacks,
  openDb,
  recentSales,
} from '@renaisslens/db'
import {
  computeVerdict,
  HEADLINE_SCENARIO,
  type Verdict,
  verdictLabel,
} from '@renaisslens/ev-engine'

export const dynamic = 'force-dynamic'

const usd = (cents: number | null) =>
  cents === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

function readDashboard() {
  let db: Database | undefined
  try {
    // readonly: never creates an empty DB file; missing DB → "no data yet"
    db = openDb(undefined, { readonly: true })
    const packs = listPacks(db)
    const dbRef = db
    // A Milestone-1 DB (pre-0002) has ev_runs without the `scenario` column;
    // the web app opens read-only and never migrates, so degrade to "no EV yet"
    // (verdict chips render "insufficient data") instead of blanking the page.
    let evRuns: EvRunRow[] = []
    try {
      evRuns = latestEvRuns(db)
    } catch {
      evRuns = []
    }
    return {
      packs,
      sales: recentSales(db, 10),
      freshness: getFreshness(db),
      mode: getDataMode(db),
      capturedAt: getMeta(db, 'demo_captured_at'),
      pullsByPack: packs.map((p) => ({ pack: p, pulls: latestPulls(dbRef, p.slug, 5) })),
      evByPack: new Map(
        packs.map((p) => [
          p.slug,
          {
            runs: evRuns.filter((r) => r.pack_slug === p.slug),
            pullCount: countPullsForPack(dbRef, p.slug),
          },
        ]),
      ),
    }
  } catch {
    return null
  } finally {
    db?.close()
  }
}

const VERDICT_CHIP: Record<Verdict, string> = {
  'plus-ev-likely': 'border-emerald-700/40 bg-emerald-950/40 text-emerald-300',
  'minus-ev-likely': 'border-red-700/40 bg-red-950/40 text-red-300',
  uncertain: 'border-amber-700/40 bg-amber-950/40 text-amber-300',
  'insufficient-data': 'border-zinc-700/60 bg-zinc-900/60 text-zinc-400',
}

/** Our EV always renders as a range — never a single point (Safety checklist). */
function packEv(ev: { runs: EvRunRow[]; pullCount: number } | undefined, priceCents: number) {
  const runs = ev?.runs ?? []
  const { verdict } = computeVerdict({
    priceCents,
    pullCount: ev?.pullCount ?? 0,
    results: runs.map((r) => ({
      scenario: r.scenario,
      probEvAbovePrice: r.prob_ev_above_price ?? 0,
    })),
  })
  return { verdict, headline: runs.find((r) => r.scenario === HEADLINE_SCENARIO) }
}

export default function Home() {
  const data = readDashboard()
  if (data === null) {
    return (
      <p className="text-zinc-400">
        No data yet — run <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
        <code className="text-prism">pnpm scrape</code> (live), then reload.
      </p>
    )
  }
  const { packs, sales, freshness, mode, capturedAt, pullsByPack, evByPack } = data
  // packs can carry different run timestamps (per-pack `ev:run --pack`), so the
  // column footnote reports the vintage span, not one pack's stamp.
  const ranAts = [
    ...new Set(
      packs
        .map((p) => packEv(evByPack.get(p.slug), p.price_cents).headline?.ran_at)
        .filter((t): t is string => t !== undefined),
    ),
  ].sort()
  const computedLabel =
    ranAts.length === 0
      ? ''
      : ranAts.length === 1
        ? `, computed ${ranAts[0]}`
        : `, computed ${ranAts[0]} – ${ranAts[ranAts.length - 1]}`

  return (
    <div className="space-y-10">
      {mode === 'mock' && (
        <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Sample data mode — showing committed snapshots
          {capturedAt ? ` captured ${capturedAt}` : ''}. Run <code>pnpm scrape</code> for live data.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-100">Packs</h2>
        <div className="overflow-x-auto rounded border border-vault-700">
          <table className="w-full text-sm">
            <thead className="bg-vault-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2">Pack</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Our EV (P10–P90)†</th>
                <th className="px-3 py-2">Verdict</th>
                <th className="px-3 py-2 text-right">Renaiss claims EV*</th>
                <th className="px-3 py-2 text-right">Featured card FMV</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => {
                const { verdict, headline } = packEv(evByPack.get(p.slug), p.price_cents)
                return (
                  <tr key={p.slug} className="border-t border-vault-800">
                    <td className="px-3 py-2 font-medium text-zinc-100">{p.name}</td>
                    <td className="px-3 py-2">{p.pack_type}</td>
                    <td className="px-3 py-2">{p.stage}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(p.price_cents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {headline ? (
                        <>
                          {usd(headline.p10_cents)}–{usd(headline.p90_cents)}{' '}
                          <span className="text-zinc-500">P50 {usd(headline.p50_cents)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`whitespace-nowrap rounded border px-2 py-0.5 text-xs ${VERDICT_CHIP[verdict]}`}
                      >
                        {verdictLabel(verdict)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {usd(p.expected_value_cents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {usd(p.featured_card_fmv_cents)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          †Our independent estimate: a seeded Monte Carlo range across pool-assumption scenarios
          (neutral scenario shown{computedLabel}); the verdict only reads +/−EV when skeptical
          scenarios agree. See the methodology in METHODOLOGY.md. *Renaiss&apos;s own published
          figure, not our estimate — shown for contrast, never used in our model. Source:
          api.renaiss.xyz/v0/packs.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-100">Recent observed pulls</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {pullsByPack
            .filter(({ pulls }) => pulls.length > 0)
            .map(({ pack, pulls }) => (
              <div key={pack.slug} className="rounded border border-vault-700 p-3">
                <h3 className="mb-2 text-sm font-medium text-zinc-200">{pack.name}</h3>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {pulls.map((pull) => (
                    <li key={pull.id} className="flex justify-between tabular-nums">
                      <span>
                        tier <span className="text-prism">{pull.tier}</span> ·{' '}
                        {new Date(pull.pulled_at * 1000)
                          .toISOString()
                          .slice(0, 16)
                          .replace('T', ' ')}
                      </span>
                      <span>{usd(pull.fmv_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-100">Latest sales activity</h2>
        {sales.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales rows yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sales.map((s) => (
              <li key={s.id} className="flex justify-between border-b border-vault-800 py-1">
                <span className="text-zinc-300">
                  {s.card_title}
                  {s.grade ? ` · ${s.grading_company ?? ''} ${s.grade}` : ''}
                </span>
                <span className="tabular-nums text-zinc-100">{usd(s.price_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-xs text-zinc-500">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Data freshness</h2>
        <ul className="space-y-0.5">
          {freshness.map((f) => (
            <li key={f.source} className="tabular-nums">
              {f.source}: {f.last_status} — data as of {f.last_success_at ?? 'never'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
