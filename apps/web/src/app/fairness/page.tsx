import {
  type Database,
  type DataMode,
  getDataMode,
  getFreshness,
  getMeta,
  listPacks,
  observatoryPulls,
  openDb,
  type SourceFreshness,
} from '@renaisslens/db'
import { MIN_PULLS_FOR_EV } from '@renaisslens/ev-engine'
import Link from 'next/link'
import { EvReconciliation } from '@/components/ev-reconciliation'
import { TierDistributionChart } from '@/components/tier-distribution-chart'
import { usd } from '@/lib/format'
import { buildObservatory, type ObservatoryPack } from '@/lib/observatory'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fairness · RenaissLens' }

type FairnessData =
  | { kind: 'no-db' }
  | {
      kind: 'ok'
      packs: ObservatoryPack[]
      mode: DataMode
      capturedAt: string | null
      freshness: SourceFreshness[]
    }

function readFairness(): FairnessData {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    return {
      kind: 'ok',
      packs: buildObservatory(listPacks(db), observatoryPulls(db)),
      mode: getDataMode(db),
      capturedAt: getMeta(db, 'demo_captured_at'),
      freshness: getFreshness(db),
    }
  } catch {
    return { kind: 'no-db' }
  } finally {
    db?.close()
  }
}

export default function Fairness() {
  const result = readFairness()

  return (
    <div className="space-y-10">
      {/* honest framing — the non-negotiable part */}
      <section className="overflow-hidden rounded-sm border border-vault-700 bg-vault-900/60">
        <div className="h-1 bg-gradient-to-r from-prism to-facet" />
        <div className="flex items-center justify-between border-b border-vault-800 px-4 py-1.5">
          <span className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
            RenaissLens · Observed-Outcomes Observatory
          </span>
          <span className="rounded border border-emerald-700/50 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-emerald-400">
            Live
          </span>
        </div>
        <div className="space-y-3 px-4 pb-4 pt-3 text-sm leading-relaxed text-zinc-300">
          <p>
            This tab observes what the public pull feed actually paid out. It does{' '}
            <span className="text-zinc-100">not</span> — and cannot — verify that Renaiss&apos;s
            draws are fair. Fairness verification needs Renaiss&apos;s commitment scheme
            (server-seed commitments and Merkle roots), which isn&apos;t public yet; until it is, no
            third party can honestly verify a pull.
          </p>
          <p>
            Renaiss also publishes a <span className="text-zinc-100">single</span> expected-value
            figure per pack and <span className="text-zinc-100">no per-tier odds</span>, so there is
            no claimed distribution to test against — we can only show empirical frequencies with
            their uncertainty and reconcile scalars. A gap between what we observe and what Renaiss
            claims is a{' '}
            <span className="text-zinc-100">flag for scrutiny, never proof of unfairness</span>: an
            incomplete or curated pull feed explains a gap just as well. See the{' '}
            <Link href="/methodology" className="underline hover:text-zinc-100">
              methodology
            </Link>{' '}
            for what the feed can and cannot tell us.
          </p>
        </div>
      </section>

      {result.kind === 'no-db' ? (
        <p className="text-zinc-400">
          No data yet — run <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
          <code className="text-prism">pnpm scrape</code> (live), then reload.
        </p>
      ) : (
        <>
          {result.mode === 'mock' && (
            <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
              Sample data mode — showing committed snapshots
              {result.capturedAt ? ` captured ${result.capturedAt}` : ''}. Run{' '}
              <code>pnpm scrape</code> for live data.
            </div>
          )}

          <Observatory packs={result.packs} />

          {/* the roadmap half that genuinely remains blocked */}
          <CryptoVerificationRoadmap />

          <footer className="border-t border-vault-800 pt-3 font-mono text-[11px] text-zinc-500">
            <p className="mb-1">provenance — observed pulls per source:</p>
            <ul className="space-y-0.5">
              {result.freshness
                .filter((f) => f.source.startsWith('api-pack-detail'))
                .map((f) => (
                  <li key={f.source} className="tabular-nums">
                    {f.source}: {f.last_status} — data as of {f.last_success_at ?? 'never'}
                  </li>
                ))}
            </ul>
          </footer>
        </>
      )}
    </div>
  )
}

function Observatory({ packs }: { packs: ObservatoryPack[] }) {
  const sufficient = packs.filter((p) => p.sufficient)
  const thin = packs.filter((p) => !p.sufficient)

  return (
    <section className="space-y-8">
      <h2 className="font-display text-xl font-semibold text-zinc-100">
        What the feed actually paid out
      </h2>

      {sufficient.length === 0 && (
        <p className="rounded border border-vault-700 bg-vault-900/60 p-4 text-sm text-zinc-400">
          No pack yet has the {MIN_PULLS_FOR_EV}+ observed pulls needed for a meaningful empirical
          distribution. The observatory fills in automatically as the public feed grows.
        </p>
      )}

      {sufficient.map((pack) => {
        const tiers = pack.tiers.map((t) => ({
          tier: t.tier,
          n: t.n,
          point: t.proportion.point ?? 0,
          lo: t.proportion.lo,
          hi: t.proportion.hi,
        }))
        const hasSingletons = pack.tiers.some((t) => t.n <= 1)
        return (
          <article
            key={pack.slug}
            className="space-y-4 rounded border border-vault-700 bg-vault-900/40 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-zinc-50">
                <Link href={`/packs/${pack.slug}`} className="hover:text-prism">
                  {pack.name}
                </Link>
              </h3>
              <span className="font-display text-xs tabular-nums text-zinc-500">
                {pack.totalPulls} observed pulls
              </span>
            </div>

            <div>
              <h4 className="mb-2 font-display text-sm font-medium text-zinc-300">
                Observed tier frequency (95% Wilson intervals)
              </h4>
              <TierDistributionChart packName={pack.name} tiers={tiers} />
              <p className="mt-1 text-xs text-zinc-500">
                Frequencies in the observed feed — Renaiss&apos;s own verbatim tier labels, never
                compared across packs. The whisker is a 95% Wilson interval; it is the same
                Jeffreys-0.5 skepticism the EV engine applies, in closed form for a single
                proportion. These are not Renaiss&apos;s true odds, which are unknown.
                {hasSingletons
                  ? ' A tier with a single observation has a very wide interval by design.'
                  : ''}
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-display text-sm font-medium text-zinc-300">
                Claimed EV vs. what we observed
              </h4>
              <EvReconciliation
                packName={pack.name}
                priceCents={pack.priceCents}
                claimedEvCents={pack.claimedEvCents}
                observedMean={pack.observedMean}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Renaiss advertises one EV figure per pack ({usd(pack.claimedEvCents)}, shown for
                contrast — never used in our model). Beside it is the mean realized FMV of the pulls
                we actually observed, with a 95% bootstrap CI. Both rest on Renaiss&apos;s own FMV
                valuations, so this compares Renaiss&apos;s claim against Renaiss&apos;s own
                realized values —{' '}
                <span className="text-zinc-300">not an independent price check</span> until the
                Index API lands. A single rare high-tier pull can swing the observed mean.
              </p>
            </div>
          </article>
        )
      })}

      {thin.length > 0 && (
        <div className="rounded border border-vault-700 bg-vault-900/40 p-4">
          <h3 className="mb-2 font-display text-sm font-medium text-zinc-200">
            Not enough observed pulls yet
          </h3>
          <p className="mb-2 text-xs text-zinc-500">
            Below {MIN_PULLS_FOR_EV} pulls, an empirical distribution is more noise than signal, so
            the observatory stays quiet — the same threshold the EV verdict uses.
          </p>
          <ul className="space-y-1 text-xs text-zinc-400">
            {thin.map((p) => (
              <li key={p.slug} className="flex justify-between tabular-nums">
                <Link href={`/packs/${p.slug}`} className="hover:text-prism">
                  {p.name}
                </Link>
                <span>{p.totalPulls} pulls</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * The cryptographic-verification half genuinely remains blocked until Renaiss
 * open-sources its commitment scheme — kept here, disabled, as its waiting home.
 */
function CryptoVerificationRoadmap() {
  return (
    <section className="max-w-2xl space-y-6">
      <div className="overflow-hidden rounded-sm border border-zinc-700/60 bg-zinc-900/60">
        <div className="h-1 bg-vault-700" />
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-1.5">
          <span className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            RenaissLens · Cryptographic Pull Verification
          </span>
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Disabled
          </span>
        </div>
        <div className="px-4 pb-4 pt-2">
          <h2 className="font-display text-xl font-bold text-zinc-400">
            Roadmap — coming when Renaiss open-sources its fairness internals
          </h2>
        </div>
      </div>

      <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
        <p>
          Verifying that a gacha pull was fair requires Renaiss&apos;s commitment scheme — the
          server-seed commitments and Merkle roots that fix each pull&apos;s outcome before you
          click. Those internals are not public yet; Renaiss has said they will be open-sourced.
          Until then, no third party can honestly verify a pull, and RenaissLens won&apos;t pretend
          otherwise.
        </p>
        <p>When the internals land, this section activates and does three things:</p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="text-zinc-100">Read the commitment.</span> Before your pull, the server
            publishes a cryptographic commitment to its seed — a promise it can&apos;t change
            afterward.
          </li>
          <li>
            <span className="text-zinc-100">Check the reveal.</span> After the pull, the server
            reveals the seed. RenaissLens hashes it and checks it against the earlier commitment and
            the published Merkle root.
          </li>
          <li>
            <span className="text-zinc-100">Re-derive your outcome.</span> From the revealed seed
            and your inputs, RenaissLens independently recomputes the pull result — proving the
            outcome was fixed <em>before</em> you clicked, not after.
          </li>
        </ol>
        <p className="border-l-2 border-prism/40 pl-3 text-zinc-400">
          The observatory above is the honest half we can build today; this is the half that waits
          on Renaiss. Both apply the same principle — every number should be something a reader can
          trace and re-derive.
        </p>
      </div>
    </section>
  )
}
