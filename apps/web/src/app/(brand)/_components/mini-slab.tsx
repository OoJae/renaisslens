import type { IndexPriceRow, ListingRow } from '@renaisslens/db'
import Link from 'next/link'
import { usd } from '@/lib/format'

/**
 * A small pure-CSS slab for the vault wall — holo strip (lit when the object is
 * cross-referenced on the Index), dark case, bone cert label. The whole slab
 * links to the object's certificate at /proof/[tokenId].
 */
export function MiniSlab({
  listing: l,
  index,
}: {
  listing: ListingRow
  index: IndexPriceRow | null
}) {
  return (
    <Link
      href={`/proof/${l.token_id}`}
      className="group block rounded-xl border border-white/10 bg-vault-800/30 transition-transform hover:-translate-y-1 motion-reduce:transform-none"
      aria-label={`${l.name} — ${l.grading_company} ${l.grade}. View its certificate.`}
    >
      <div
        className={`holo-foil h-[3px] w-full rounded-t-xl ${index ? 'opacity-90' : 'opacity-25 saturate-50'}`}
        style={{ mixBlendMode: 'screen' }}
      />
      <div className="px-3 pb-3 pt-4">
        <p className="truncate font-display text-sm text-bone-50" title={l.name}>
          {l.name}
        </p>
        <p className="type-cert mt-1 truncate text-fog">
          {l.grading_company} · {l.grade}
          {l.set_name ? ` · ${l.set_name}` : ''}
        </p>
        <div className="mt-3 rounded-lg bg-slab px-3 py-2 text-plaque">
          <div className="flex items-baseline justify-between gap-2">
            <span className="type-cert">ask {usd(l.ask_price_cents)}</span>
            <span className="type-cert opacity-70">fmv {usd(l.fmv_cents)}</span>
          </div>
          {index && (
            <p className="type-cert mt-1 border-t border-plaque/10 pt-1">
              Index {usd(index.price_cents)}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
