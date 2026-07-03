import type { EvRunRow, PackRow } from '@renaisslens/db'
import type { Verdict } from '@renaisslens/ev-engine'
import Link from 'next/link'
import { usd } from '@/lib/format'
import { SlabBadge } from './slab-badge'

interface PackCardProps {
  pack: PackRow
  verdict: Verdict
  reason: string
  headline: EvRunRow | undefined
}

/** Static P10→P90 range strip with a slab-colored tick at the pack price. */
function RangeStrip({ headline, priceCents }: { headline: EvRunRow; priceCents: number }) {
  const p10 = headline.p10_cents
  const p90 = headline.p90_cents
  if (p10 === null || p90 === null) return null
  // scale spans the range and the price with 10% headroom either side
  const lo = Math.min(p10, priceCents)
  const hi = Math.max(p90, priceCents)
  const span = Math.max(1, hi - lo)
  const pad = span * 0.1
  const toPct = (v: number) => ((v - lo + pad) / (span + 2 * pad)) * 100
  const clamp = (v: number) => Math.min(100, Math.max(0, v))
  return (
    <div aria-hidden className="relative mt-2 h-1 rounded-full bg-vault-800">
      <div
        className="absolute inset-y-0 rounded-full bg-gradient-to-r from-prism/60 to-facet/60"
        style={{ left: `${clamp(toPct(p10))}%`, width: `${clamp(toPct(p90) - toPct(p10))}%` }}
      />
      <div
        className="absolute -top-0.5 h-2 w-0.5 bg-slab"
        style={{ left: `${clamp(toPct(priceCents))}%` }}
        title="pack price"
      />
    </div>
  )
}

export function PackCard({ pack, verdict, reason, headline }: PackCardProps) {
  return (
    <Link
      href={`/packs/${pack.slug}`}
      className="block rounded-lg border border-vault-700 bg-vault-900 transition-colors hover:border-prism/50 motion-reduce:transition-none"
    >
      <article>
        <SlabBadge verdict={verdict} reason={reason} size="card" />
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-zinc-50">{pack.name}</h3>
            <div className="flex gap-1.5">
              <span className="rounded border border-vault-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                {pack.pack_type}
              </span>
              <span className="rounded border border-vault-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                {pack.stage}
              </span>
            </div>
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-400">Price</dt>
              <dd className="font-display font-semibold tabular-nums text-zinc-100">
                {usd(pack.price_cents)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-400">Our EV (P10–P50–P90)†</dt>
              <dd className="text-right font-display tabular-nums text-zinc-100">
                {headline ? (
                  <>
                    {usd(headline.p10_cents)} –{' '}
                    <span className="font-semibold">{usd(headline.p50_cents)}</span> –{' '}
                    {usd(headline.p90_cents)}
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Featured card FMV</dt>
              <dd className="tabular-nums text-zinc-300">{usd(pack.featured_card_fmv_cents)}</dd>
            </div>
          </dl>
          {headline && <RangeStrip headline={headline} priceCents={pack.price_cents} />}
          <p className="mt-3 text-xs text-zinc-500">
            Renaiss claims EV {usd(pack.expected_value_cents)}*
          </p>
        </div>
      </article>
    </Link>
  )
}
