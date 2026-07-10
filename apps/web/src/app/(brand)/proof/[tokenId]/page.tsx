import {
  type Database,
  type DataMode,
  getDataMode,
  getListingByTokenId,
  getSnapshotById,
  type IndexPriceRow,
  indexMatchKey,
  type ListingHistoryRow,
  type ListingRow,
  listingHistory,
  openDb,
  type SaleRow,
  type SnapshotRow,
  salesForToken,
} from '@renaisslens/db'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { relativeTime, usd } from '@/lib/format'
import { freshIndexByKey } from '@/lib/index-prices'
import { CertHeader } from '../../_components/cert-header'
import { ProofSeal } from '../../_components/proof-seal'
import { SlabPoster } from '../../_components/slab-poster'
import { Wordmark } from '../../_components/wordmark'

export const dynamic = 'force-dynamic'

// token_id is an on-chain uint256 kept as digits-only TEXT (≤78 digits)
const TOKEN_RE = /^\d{1,78}$/

type ProofResult =
  | { kind: 'no-db' }
  | { kind: 'unknown' }
  | {
      kind: 'ok'
      listing: ListingRow
      history: ListingHistoryRow[]
      sales: SaleRow[]
      snapshot: SnapshotRow | null
      index: IndexPriceRow | null
      mode: DataMode
    }

// cache() → the page and generateMetadata share one db read per request
const readProof = cache((tokenId: string): ProofResult => {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    const listing = getListingByTokenId(db, tokenId)
    if (listing === undefined) return { kind: 'unknown' }
    return {
      kind: 'ok',
      listing,
      history: listingHistory(db, tokenId),
      sales: salesForToken(db, tokenId),
      snapshot: getSnapshotById(db, listing.snapshot_id) ?? null,
      index:
        freshIndexByKey(db).get(
          indexMatchKey(
            listing.grading_company,
            listing.grade,
            listing.set_name,
            listing.card_number,
            listing.language,
          ),
        ) ?? null,
      mode: getDataMode(db),
    }
  } catch {
    return { kind: 'no-db' }
  } finally {
    db?.close()
  }
})

/** `123456…7890` for ids/hashes too long for a line; full value goes in `title`. */
const short = (s: string): string => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

export function generateMetadata({ params }: { params: { tokenId: string } }): Metadata {
  if (!TOKEN_RE.test(params.tokenId)) return { title: 'Proof · RenaissLens' }
  const r = readProof(params.tokenId)
  if (r.kind !== 'ok') return { title: 'Proof · RenaissLens' }
  const l = r.listing
  const gradeLine = [l.grading_company, l.grade].filter(Boolean).join(' ')
  const title = `${l.name}${gradeLine ? ` — ${gradeLine}` : ''} · RenaissLens`
  const description = `Certificate of observed provenance for ${l.name}: grade, custody, price record, and content seal — assembled from public renaiss.xyz data.`
  return { title, description, openGraph: { title, description, type: 'article' } }
}

function SectionShell({
  num,
  label,
  children,
}: {
  num: string
  label: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`proof-${num}`}
      className="mx-auto grid max-w-[1600px] grid-cols-12 gap-y-4 border-t border-vault-800/60 px-5 py-12 sm:px-10 lg:py-16"
    >
      <div className="col-span-12 lg:col-span-3">
        <p className="type-num">{num}</p>
        <p id={`proof-${num}`} className="type-eyebrow mt-2 text-prism/80">
          {label}
        </p>
      </div>
      <div className="col-span-12 min-w-0 lg:col-span-8 lg:col-start-5">{children}</div>
    </section>
  )
}

function Row({ k, v, title }: { k: string; v: React.ReactNode; title?: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-vault-800/40 py-2.5 sm:grid-cols-[11rem_1fr]">
      <dt className="type-cert text-fog">{k}</dt>
      <dd className="type-cert min-w-0 break-words text-bone-50" title={title}>
        {v}
      </dd>
    </div>
  )
}

const dash = <span className="text-fog">—</span>

export default function ProofPage({ params }: { params: { tokenId: string } }) {
  if (!TOKEN_RE.test(params.tokenId)) notFound()
  const r = readProof(params.tokenId)
  if (r.kind === 'unknown') notFound()
  if (r.kind === 'no-db') {
    return (
      <main className="grid min-h-[100svh] place-content-center px-5 text-center">
        <Wordmark className="mx-auto text-lg" />
        <p className="type-lead mt-6 max-w-md text-fog">
          No observations yet — run <code className="text-prism">pnpm scrape:mock</code> (offline)
          or <code className="text-prism">pnpm scrape</code> (live), then reload.
        </p>
      </main>
    )
  }

  const { listing: l, history, sales, snapshot, index, mode } = r
  const graded = l.grading_company !== null && l.grade !== null
  const indexDeltaPct =
    index !== null && l.fmv_cents !== null && l.fmv_cents > 0
      ? Math.round((index.price_cents / l.fmv_cents - 1) * 100)
      : null

  return (
    <div id="main">
      <CertHeader />

      {/* ── dossier hero ── */}
      <section
        aria-labelledby="proof-title"
        className="mx-auto grid max-w-[1600px] grid-cols-12 items-center gap-y-10 px-5 pb-14 pt-28 sm:px-10 lg:gap-x-6 lg:pb-20 lg:pt-36"
      >
        <div className="col-span-12 flex justify-center lg:col-span-5 lg:justify-start lg:pl-[6%]">
          <SlabPoster
            className="w-[min(62vw,17rem)]"
            state={graded ? 'proven' : 'raw'}
            company={l.grading_company ?? 'Ungraded'}
            grade={l.grade ?? '—'}
            serial={`CERT · ${short(l.token_id)}`}
            title={l.name}
          />
        </div>
        <div className="col-span-12 min-w-0 lg:col-span-6 lg:col-start-7">
          <p className="type-eyebrow">Certificate of observed provenance</p>
          <h1 id="proof-title" className="type-section mt-4 text-balance break-words">
            {l.name}
          </h1>
          <div aria-hidden className="auth-line mt-6 max-w-[8rem]" data-in="true" />
          <p className="type-cert mt-6 break-all text-fog" title="on-chain collectible token id">
            TOKEN · {l.token_id}
          </p>
          <p className="type-lead mt-6 max-w-md text-fog">
            An observation record assembled from public renaiss.xyz data — what we saw, when we saw
            it, and the seal to check it against.
          </p>
        </div>
      </section>

      {/* ── 01 identity ── */}
      <SectionShell num="01" label="Identity">
        <dl>
          <Row k="Name" v={l.name} />
          <Row k="Set" v={l.set_name ?? dash} />
          <Row k="Card number" v={l.card_number ?? dash} />
          <Row k="Language" v={l.language ?? dash} />
          <Row k="Year" v={l.year ?? dash} />
        </dl>
      </SectionShell>

      {/* ── 02 the grade ── */}
      <SectionShell num="02" label="The Grade">
        <p className="type-section max-w-2xl text-balance">
          {graded ? `${l.grading_company} ${l.grade}` : 'Ungraded'}
        </p>
        <p className="type-cert mt-4 text-fog">
          {graded
            ? `The grade belongs to ${l.grading_company} — not to RenaissLens.`
            : 'No grade observed for this object.'}
        </p>
      </SectionShell>

      {/* ── 03 custody ── */}
      <SectionShell num="03" label="Custody">
        <dl>
          <Row k="Vault" v={l.vault_location ?? dash} />
          <Row k="Holder" v={l.owner_username ?? dash} />
          <Row
            k="Holder address"
            v={l.owner_address ? short(l.owner_address) : dash}
            title={l.owner_address ?? undefined}
          />
        </dl>
        <p className="type-cert mt-4 text-fog">
          Public on-chain marketplace data, as displayed by renaiss.xyz.
        </p>
      </SectionShell>

      {/* ── 04 price record ── */}
      <SectionShell num="04" label="Price record">
        <dl>
          <Row k="Ask" v={usd(l.ask_price_cents)} />
          {l.ask_expires_at && (
            <Row k="Ask expires" v={relativeTime(l.ask_expires_at)} title={l.ask_expires_at} />
          )}
          <Row
            k="FMV"
            v={
              <>
                {usd(l.fmv_cents)}{' '}
                <span className="text-fog">— Renaiss&apos;s own valuation, shown as context</span>
              </>
            }
          />
        </dl>
        {history.length > 0 && (
          <div className="mt-6">
            <p className="type-eyebrow text-fog">Observed changes</p>
            <ol className="mt-3">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="grid grid-cols-[8rem_1fr] gap-3 border-b border-vault-800/40 py-2.5 sm:grid-cols-[11rem_1fr]"
                >
                  <span className="type-cert text-fog" title={h.observed_at}>
                    {relativeTime(h.observed_at)}
                  </span>
                  <span className="type-cert text-bone-50">
                    ask {usd(h.ask_price_cents)} · fmv {usd(h.fmv_cents)}
                  </span>
                </li>
              ))}
            </ol>
            {history.length === 1 && (
              <p className="type-cert mt-3 text-fog">A single observation, not a trend.</p>
            )}
          </div>
        )}
        {sales.length > 0 && (
          <div className="mt-6">
            <p className="type-eyebrow text-fog">Observed sale events</p>
            <ol className="mt-3">
              {sales.map((s) => (
                <li
                  key={s.id}
                  className="grid grid-cols-[8rem_1fr] gap-3 border-b border-vault-800/40 py-2.5 sm:grid-cols-[11rem_1fr]"
                >
                  <span className="type-cert text-fog" title={s.sold_at ?? s.observed_at}>
                    {relativeTime(s.sold_at ?? s.observed_at)}
                  </span>
                  <span className="type-cert text-bone-50">{usd(s.price_cents)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </SectionShell>

      {/* ── 05 independent cross-reference ── */}
      <SectionShell num="05" label="Cross-reference">
        {index !== null ? (
          <>
            <p className="type-section max-w-2xl">
              <span className="text-facet">{usd(index.price_cents)}</span>
            </p>
            {indexDeltaPct !== null && (
              <p className="type-cert mt-3">
                <span
                  className={Math.abs(indexDeltaPct) <= 15 ? 'text-emerald-400' : 'text-amber-300'}
                >
                  {indexDeltaPct >= 0 ? '+' : ''}
                  {indexDeltaPct}% vs FMV
                  {Math.abs(indexDeltaPct) <= 15 ? ' — agrees' : ' — diverges'}
                </span>
              </p>
            )}
            <dl className="mt-4">
              {index.confidence && <Row k="Match confidence" v={index.confidence} />}
              {index.last_sale_at && (
                <Row
                  k="Last Index sale"
                  v={relativeTime(index.last_sale_at)}
                  title={index.last_sale_at}
                />
              )}
              <Row k="Observed" v={relativeTime(index.observed_at)} title={index.observed_at} />
            </dl>
            <p className="type-cert mt-4 text-fog">
              Reference price from the{' '}
              <a
                href={index.href ?? 'https://index.renaissos.com'}
                rel="noreferrer"
                className="text-bone-50 underline-offset-4 hover:underline"
              >
                Renaiss OS Index
              </a>{' '}
              — matched exactly on company · grade · set · number · language, never fuzzily.
            </p>
          </>
        ) : (
          <p className="type-lead max-w-xl text-fog">
            No confident match on the Renaiss OS Index — we leave it unpriced rather than guess.
          </p>
        )}
      </SectionShell>

      {/* ── 06 provenance ── */}
      <SectionShell num="06" label="Provenance">
        <dl>
          <Row k="First observed" v={relativeTime(l.first_seen_at)} title={l.first_seen_at} />
          <Row k="Last observed" v={relativeTime(l.observed_at)} title={l.observed_at} />
          {snapshot && (
            <>
              <Row k="Source" v={snapshot.source} />
              <Row k="Source URL" v={snapshot.url} />
              <Row k="Fetched" v={relativeTime(snapshot.fetched_at)} title={snapshot.fetched_at} />
              <Row
                k="Content seal"
                v={<span className="break-all">sha256 · {short(snapshot.content_sha256)}</span>}
                title={snapshot.content_sha256}
              />
            </>
          )}
          {mode === 'mock' && (
            <Row k="Data mode" v="sample data — captured demo snapshots, not the live feed" />
          )}
        </dl>
      </SectionShell>

      {/* ── honesty plaque ── */}
      <footer className="mx-auto max-w-[1600px] px-5 py-14 sm:px-10 lg:py-20">
        <div className="mx-auto grid max-w-[1600px] grid-cols-12">
          <div className="col-span-12 rounded-2xl bg-slab px-6 py-6 text-plaque sm:px-8 lg:col-span-8 lg:col-start-5">
            <div className="flex items-start gap-4">
              <ProofSeal size={40} className="mt-1 shrink-0" />
              <p className="type-cert leading-relaxed">
                This is an observation record assembled from public data on renaiss.xyz.
                {l.grading_company ? ` The grade belongs to ${l.grading_company}.` : ''} RenaissLens
                did not grade, authenticate, or custody this object. Estimates are labeled as
                estimates.{' '}
                <Link href="/standard" className="underline underline-offset-4">
                  Read the standard
                </Link>{' '}
                ·{' '}
                <Link href="/vault" className="underline underline-offset-4">
                  Back to the vault
                </Link>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
