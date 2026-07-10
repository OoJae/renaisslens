import {
  type Database,
  type DataMode,
  getDataMode,
  type IndexPriceRow,
  indexMatchKey,
  type ListingRow,
  listGradedListings,
  openDb,
} from '@renaisslens/db'
import type { Metadata } from 'next'
import Link from 'next/link'
import { formatInt } from '@/lib/format'
import { freshIndexByKey } from '@/lib/index-prices'
import { CertHeader } from '../_components/cert-header'
import { MiniSlab } from '../_components/mini-slab'
import { Wordmark } from '../_components/wordmark'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Vault · RenaissLens',
  description:
    'Every graded object observed on the renaiss.xyz public marketplace — grade, seal, price record, and Index cross-reference. A wall of observations, not holdings.',
}

// keeps the DOM sane at live scale (~300 graded listings); the cap is disclosed
const WALL_LIMIT = 120

type VaultResult =
  | { kind: 'no-db' }
  | {
      kind: 'ok'
      slabs: Array<{ listing: ListingRow; index: IndexPriceRow | null }>
      stats: { graded: number; withFmv: number; indexed: number }
      mode: DataMode
    }

function readVault(): VaultResult {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    const graded = listGradedListings(db)
    const indexByKey = freshIndexByKey(db)
    const slabs = graded.map((listing) => ({
      listing,
      index:
        indexByKey.get(
          indexMatchKey(
            listing.grading_company,
            listing.grade,
            listing.set_name,
            listing.card_number,
            listing.language,
          ),
        ) ?? null,
    }))
    return {
      kind: 'ok',
      slabs,
      stats: {
        graded: graded.length,
        withFmv: graded.filter((l) => l.fmv_cents !== null).length,
        indexed: slabs.filter((s) => s.index !== null).length,
      },
      mode: getDataMode(db),
    }
  } catch {
    return { kind: 'no-db' }
  } finally {
    db?.close()
  }
}

export default function Vault() {
  const r = readVault()
  if (r.kind === 'no-db') {
    return (
      <main className="grid min-h-[100svh] place-content-center px-5 text-center">
        <Wordmark className="mx-auto text-lg" />
        <p className="type-lead mt-6 max-w-md text-fog">
          The vault is empty — run <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
          <code className="text-prism">pnpm scrape</code> (live), then reload.
        </p>
      </main>
    )
  }

  const { slabs, stats, mode } = r
  const shown = slabs.slice(0, WALL_LIMIT)

  return (
    <div id="main">
      <CertHeader />

      {/* ── hero ── */}
      <section
        aria-labelledby="vault-title"
        className="mx-auto max-w-[1600px] px-5 pb-10 pt-28 sm:px-10 lg:pb-14 lg:pt-36"
      >
        <p className="type-eyebrow">Objects under observation</p>
        <h1 id="vault-title" className="type-hero mt-4 text-balance">
          The Vault
        </h1>
        <div aria-hidden className="auth-line mt-6 max-w-[8rem]" data-in="true" />
        <p className="type-lead mt-6 max-w-xl text-fog">
          Every graded object observed on renaiss.xyz&apos;s public marketplace sample — a wall of
          observations, not holdings. RenaissLens custodies nothing, and there are no accounts here.
        </p>
        <p className="type-cert mt-8 text-fog">
          {formatInt(stats.graded)} graded objects · {formatInt(stats.withFmv)} with FMV ·{' '}
          {formatInt(stats.indexed)} cross-referenced on the Index
          {mode === 'mock' ? ' · sample data' : ''}
        </p>
      </section>

      {/* ── the wall ── */}
      <section aria-label="Graded objects" className="mx-auto max-w-[1600px] px-5 pb-16 sm:px-10">
        {shown.length === 0 ? (
          <p className="type-lead max-w-xl text-fog">
            No graded objects under observation yet — the marketplace sample held none with both a
            grading company and a grade on the record.
          </p>
        ) : (
          <>
            <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
              {shown.map(({ listing, index }) => (
                <li key={listing.token_id} className="min-w-0">
                  <MiniSlab listing={listing} index={index} />
                </li>
              ))}
            </ul>
            {slabs.length > WALL_LIMIT && (
              <p className="type-cert mt-6 text-fog">
                Showing {WALL_LIMIT} of {formatInt(slabs.length)} under observation — richest
                records first.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── the analytics desk ── */}
      <footer className="mx-auto max-w-[1600px] border-t border-vault-800/60 px-5 py-14 sm:px-10 lg:py-20">
        <div className="grid grid-cols-12 gap-y-4">
          <div className="col-span-12 lg:col-span-3">
            <p className="type-eyebrow text-fog">The analytics desk</p>
          </div>
          <div className="col-span-12 lg:col-span-8 lg:col-start-5">
            <p className="type-lead max-w-xl text-fog">
              The anomaly radar, the sales pulse, and the Renaiss OS Index panel live on the market
              desk.
            </p>
            <Link
              href="/market"
              className="type-cert mt-6 inline-flex items-center gap-2 text-bone-50 transition-colors hover:text-prism"
            >
              Open the market <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
