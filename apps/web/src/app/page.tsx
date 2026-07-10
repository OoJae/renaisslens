import {
  countPullsForPack,
  type Database,
  type EvRunRow,
  getDataMode,
  getFreshness,
  getMeta,
  latestEvRuns,
  listPacks,
  openDb,
} from '@renaisslens/db'
import Link from 'next/link'
import { PackCard } from '@/components/pack-card'
import { packEv } from '@/lib/verdict-ui'

export const dynamic = 'force-dynamic'

function readDashboard() {
  let db: Database | undefined
  try {
    // readonly: never creates an empty DB file; missing DB → "no data yet"
    db = openDb(undefined, { readonly: true })
    const packs = listPacks(db)
    const dbRef = db
    // A Milestone-1 DB (pre-0002) has ev_runs without the `scenario` column;
    // the web app opens read-only and never migrates, so degrade to "no EV yet"
    // (verdict slabs render "insufficient data") instead of blanking the page.
    let evRuns: EvRunRow[] = []
    try {
      evRuns = latestEvRuns(db)
    } catch {
      evRuns = []
    }
    return {
      packs,
      freshness: getFreshness(db),
      mode: getDataMode(db),
      capturedAt: getMeta(db, 'demo_captured_at'),
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
  const { packs, freshness, mode, capturedAt, evByPack } = data
  // packs can carry different run timestamps (per-pack `ev:run --pack`), so the
  // footnote reports the vintage span, not one pack's stamp.
  const ranAts = [
    ...new Set(
      packs
        .map((p) => packEv(evByPack.get(p.slug), p.price_cents).headline?.ran_at)
        .filter((t): t is string => t !== undefined),
    ),
  ].sort()
  const firstRanAt = ranAts[0]
  const lastRanAt = ranAts[ranAts.length - 1]
  const computedLabel =
    firstRanAt === undefined
      ? ''
      : ranAts.length === 1
        ? `, computed ${firstRanAt}`
        : `, computed ${firstRanAt} – ${lastRanAt}`

  return (
    <div className="space-y-10">
      {mode === 'mock' && (
        <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Sample data mode — showing committed snapshots
          {capturedAt ? ` captured ${capturedAt}` : ''}. Run <code>pnpm scrape</code> for live data.
        </div>
      )}

      <section>
        <h2 className="sr-only">Packs</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {packs.map((p) => {
            const { verdict, reason, headline } = packEv(evByPack.get(p.slug), p.price_cents)
            return (
              <li key={p.slug} className="min-w-0">
                <PackCard pack={p} verdict={verdict} reason={reason} headline={headline} />
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-xs text-zinc-500">
          †Our independent estimate: a seeded Monte Carlo range across pool-assumption scenarios
          (neutral scenario shown{computedLabel}); the verdict only reads +/−EV when skeptical
          scenarios agree. See the{' '}
          <Link href="/methodology" className="underline hover:text-zinc-300">
            methodology
          </Link>
          . *Renaiss&apos;s own published figure, not our estimate — shown for contrast, never used
          in our model. Source: api.renaiss.xyz/v0/packs.
        </p>
      </section>

      <section className="text-xs text-zinc-500">
        <h2 className="mb-2 font-display text-sm font-medium text-zinc-300">Data freshness</h2>
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
