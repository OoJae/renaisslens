import {
  categorizeSaleTitle,
  categorySalesStats,
  type Database,
  getDataMode,
  getFreshness,
  getIndexMarket,
  getMeta,
  type IndexPriceRow,
  indexMatchKey,
  type ListingAnomalyRow,
  latestSaleAt,
  listingAnomalies,
  medianAskToFmvRatio,
  openDb,
  salesBatchInfo,
  salesSince,
} from '@renaisslens/db'
import { relativeTime, usd } from '@/lib/format'
import { freshIndexByKey } from '@/lib/index-prices'

const INDEX_SITE = 'https://index.renaissos.com'

type IndexEntry = { game: string; label: string; value: number; d7: number | null }
type IndexTrade = {
  name: string
  gradeLabel: string | null
  priceUsdCents: number
  href: string | null
}
type AnomalyWithIndex = ListingAnomalyRow & { index: IndexPriceRow | null }

export const dynamic = 'force-dynamic'

const WINDOW_MS = 24 * 60 * 60 * 1000
const ANOMALY_MIN_RATIO = 2.0
const ANOMALIES_PER_SIDE = 8

function readMarket() {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    const latest = latestSaleAt(db)
    // window anchored to the newest OBSERVED sale, never wall-clock: the
    // committed demo data is fixed in time and must render identically later
    const sales =
      latest !== null ? salesSince(db, new Date(Date.parse(latest) - WINDOW_MS).toISOString()) : []

    // Renaiss OS Index cross-pricing — join each anomaly to its independent
    // reference price by the shared normalized key (TS join; no cert needed).
    // Staleness handling lives in freshIndexByKey (shared with the brand pages).
    const indexByKey = freshIndexByKey(db)
    const withIndex = (a: ListingAnomalyRow): AnomalyWithIndex => ({
      ...a,
      index:
        indexByKey.get(
          indexMatchKey(a.grading_company, a.grade, a.set_name, a.card_number, a.language),
        ) ?? null,
    })
    const anomaliesWithIndex = listingAnomalies(db, ANOMALY_MIN_RATIO, 50).map(withIndex)
    const indicesRaw = getIndexMarket(db, 'indices')
    const tradesRaw = getIndexMarket(db, 'recent_trades')
    const parseArr = <T,>(raw: string | undefined): T[] => {
      if (raw === undefined) return []
      try {
        const v = JSON.parse(raw)
        return Array.isArray(v) ? (v as T[]) : []
      } catch {
        return []
      }
    }

    return {
      mode: getDataMode(db),
      capturedAt: getMeta(db, 'demo_captured_at'),
      freshness: getFreshness(db).filter(
        (f) =>
          f.source === 'site-home-activities' ||
          f.source === 'api-marketplace' ||
          f.source === 'api-index',
      ),
      batch: salesBatchInfo(db),
      latest,
      sales,
      stats: categorySalesStats(sales),
      anomalies: anomaliesWithIndex,
      medianRatio: medianAskToFmvRatio(db),
      // honest coverage: anomalies that actually resolved an Index line, not the total prices on file
      indexMatched: anomaliesWithIndex.filter((a) => a.index !== null).length,
      indexObservedAt: indicesRaw?.observed_at ?? tradesRaw?.observed_at ?? null,
      indices: parseArr<IndexEntry>(indicesRaw?.payload_json),
      indexTrades: parseArr<IndexTrade>(tradesRaw?.payload_json),
    }
  } catch {
    return null
  } finally {
    db?.close()
  }
}

const ratioBadge = (ratio: number): string =>
  ratio >= 1
    ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× FMV`
    : `${ratio.toFixed(2)}× FMV`

/** Independent Renaiss OS Index price vs Renaiss's own FMV — agree/diverge signal. */
function IndexCrossRef({
  indexCents,
  fmvCents,
  confidence,
}: {
  indexCents: number
  fmvCents: number
  confidence: string | null
}) {
  const deltaPct = Math.round((indexCents / fmvCents - 1) * 100)
  const agrees = Math.abs(deltaPct) <= 15
  return (
    <p className="mt-0.5 text-xs tabular-nums">
      <span className="text-facet">Index {usd(indexCents)}</span>{' '}
      <span className={agrees ? 'text-emerald-400' : 'text-amber-300'}>
        ({deltaPct >= 0 ? '+' : ''}
        {deltaPct}% vs FMV{agrees ? ' — agrees' : ''})
      </span>
      {confidence ? <span className="text-zinc-600"> · {confidence} conf.</span> : null}
    </p>
  )
}

export default function Market() {
  const data = readMarket()
  if (data === null) {
    return (
      <p className="text-zinc-400">
        No data yet — run <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
        <code className="text-prism">pnpm scrape</code> (live), then reload.
      </p>
    )
  }
  const {
    mode,
    capturedAt,
    freshness,
    batch,
    latest,
    sales,
    stats,
    anomalies,
    medianRatio,
    indexMatched,
    indexObservedAt,
    indices,
    indexTrades,
  } = data
  const above = anomalies.filter((a) => a.direction === 'above-fmv')
  const below = anomalies.filter((a) => a.direction === 'below-fmv')
  const windowStart = latest
    ? new Date(Date.parse(latest) - WINDOW_MS).toISOString().slice(0, 16).replace('T', ' ')
    : null
  const windowEnd = latest ? latest.slice(0, 16).replace('T', ' ') : null

  return (
    <div className="space-y-10">
      {mode === 'mock' && (
        <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Sample data mode — showing committed snapshots
          {capturedAt ? ` captured ${capturedAt}` : ''}. Run <code>pnpm scrape</code> for live data.
        </div>
      )}

      <section>
        <h2 className="mb-1 font-display text-lg font-medium text-zinc-100">Sales pulse</h2>
        <p className="mb-3 text-sm text-zinc-400">
          <span className="font-display font-semibold text-zinc-100">{sales.length} sales</span>{' '}
          observed in the trailing 24 h of feed data
          {windowStart && windowEnd ? ` (${windowStart} – ${windowEnd} UTC)` : ''}.
        </p>
        {stats.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <li key={s.key} className="rounded border border-vault-700 bg-vault-900/60 p-3">
                <p className="font-display text-[11px] uppercase tracking-[0.14em] text-prism">
                  {s.label}
                </p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums text-zinc-100">
                  {s.n} <span className="text-sm font-normal text-zinc-400">sales</span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-zinc-400">
                  median {usd(s.medianPriceCents)} · range {usd(s.minPriceCents)}–
                  {usd(s.maxPriceCents)}
                </p>
                {s.latestAt && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    latest{' '}
                    <time dateTime={s.latestAt} title={s.latestAt}>
                      {relativeTime(s.latestAt)}
                    </time>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          {batch.snapshotCount <= 1
            ? `These figures describe a single scrape of Renaiss's public sales feed${
                batch.lastObservedAt ? ` (captured ${batch.lastObservedAt})` : ''
              } — a snapshot, not a trend. Momentum and change-over-time signals will appear here automatically once repeated scrapes accumulate history (the collector polls the feed every 30 minutes).`
            : `Aggregated across ${batch.snapshotCount} scrapes since ${batch.firstObservedAt ?? '—'}.`}
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-medium text-zinc-100">Latest sales</h2>
        {sales.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales rows yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sales.map((s) => {
              const category = categorizeSaleTitle(s.card_title)
              const at = s.sold_at ?? s.observed_at
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-vault-800 py-1.5"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 rounded border border-vault-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                      {category.label}
                    </span>
                    <span className="min-w-0 text-zinc-300">{s.card_title}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <time dateTime={at} title={at} className="text-xs text-zinc-500">
                      {relativeTime(at)}
                    </time>
                    <span className="font-display font-semibold tabular-nums text-zinc-100">
                      {usd(s.price_cents)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Source: renaiss.xyz home activities feed
          {freshness.find((f) => f.source === 'site-home-activities')?.last_success_at
            ? ` (${freshness.find((f) => f.source === 'site-home-activities')?.last_success_at})`
            : ''}
          . Categories are parsed from card titles and may misclassify unusual ones.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-medium text-zinc-100">
          Listing anomaly radar
        </h2>
        <p className="mb-3 text-sm text-zinc-400">
          Listings whose asking price diverges ≥{ANOMALY_MIN_RATIO}× from Renaiss&apos;s own FMV
          figure
          {medianRatio !== null
            ? ` — median ask/FMV across the sample: ${medianRatio.toFixed(2)}×`
            : ''}
          .
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              { title: 'Ask above FMV', rows: above },
              { title: 'Ask below FMV', rows: below },
            ] as const
          ).map(({ title, rows }) => (
            <div key={title} className="min-w-0 rounded border border-vault-700">
              <div className="flex items-baseline justify-between border-b border-vault-800 bg-vault-900 px-3 py-2">
                <h3 className="font-display text-sm font-medium text-zinc-200">{title}</h3>
                <span className="text-xs text-zinc-500">
                  showing {Math.min(ANOMALIES_PER_SIDE, rows.length)} of {rows.length}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-500">None at this threshold.</p>
              ) : (
                <ul className="divide-y divide-vault-800">
                  {rows.slice(0, ANOMALIES_PER_SIDE).map((a) => (
                    <li key={a.token_id} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm text-zinc-300" title={a.name}>
                          {a.name}
                        </p>
                        <span className="shrink-0 rounded border border-amber-700/40 bg-amber-950/40 px-1.5 py-0.5 font-display text-[11px] tabular-nums text-amber-300">
                          {ratioBadge(a.ratio)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                        {a.grading_company ?? ''} {a.grade ?? ''}
                        {a.set_name ? ` · ${a.set_name}` : ''} · ask {usd(a.ask_price_cents)} vs FMV{' '}
                        {usd(a.fmv_cents)}
                      </p>
                      {a.index !== null && a.fmv_cents !== null && (
                        <IndexCrossRef
                          indexCents={a.index.price_cents}
                          fmvCents={a.fmv_cents}
                          confidence={a.index.confidence}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs text-zinc-500">
          <p>
            A listing anomaly is a divergence between a seller&apos;s asking price and
            Renaiss&apos;s own fair-market-value (FMV) figure for the same card. It is surfaced for
            transparency only — it is not investment advice, and not a suggestion to buy or sell
            anything.
          </p>
          <p>
            FMV is Renaiss&apos;s published valuation, not ours; either number can be stale, and the
            listing sample covers only the most recently listed cards — a labeled sample, not the
            full marketplace.
          </p>
          {indexMatched > 0 && (
            <p>
              The <span className="text-facet">Index</span> line is an{' '}
              <span className="text-zinc-300">independent</span> reference price from the Renaiss OS
              Index — the first number here that isn&apos;t Renaiss&apos;s own valuation. When it
              agrees with FMV, the anomaly is a real ask-vs-market gap; when it diverges, FMV itself
              may be stale. {indexMatched} of these flagged listing{indexMatched === 1 ? '' : 's'}{' '}
              matched exactly (set + number + grade + company + language); cards we can&apos;t match
              confidently — or where more than one card variant shares that identity — are left
              without an Index line rather than guessed. Reference prices:{' '}
              <a href={INDEX_SITE} className="underline hover:text-zinc-300" rel="noreferrer">
                Renaiss OS Index
              </a>
              .
            </p>
          )}
        </div>
      </section>

      {indices.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-medium text-zinc-100">Renaiss OS Index</h2>
            <a
              href={INDEX_SITE}
              rel="noreferrer"
              className="font-display text-[11px] uppercase tracking-[0.14em] text-facet hover:text-zinc-200"
            >
              Data: Renaiss OS Index ↗
            </a>
          </div>
          <p className="mb-3 text-sm text-zinc-400">
            An independent, cross-marketplace price index — separate from Renaiss&apos;s own FMV. We
            surface it for context and to cross-check the FMV figures above.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {indices.map((idx) => (
              <li key={idx.game} className="rounded border border-vault-700 bg-vault-900/60 p-3">
                <p className="font-display text-[11px] uppercase tracking-[0.14em] text-prism">
                  {idx.label}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-xl font-semibold tabular-nums text-zinc-100">
                    {idx.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                  {idx.d7 !== null && (
                    <span
                      className={`text-xs tabular-nums ${idx.d7 >= 0 ? 'text-emerald-400' : 'text-amber-300'}`}
                    >
                      {idx.d7 >= 0 ? '+' : ''}
                      {idx.d7.toFixed(2)}% 7d
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
          {indexTrades.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 font-display text-sm font-medium text-zinc-200">
                Recent independent trades
              </h3>
              <ul className="space-y-1 text-sm">
                {indexTrades.slice(0, 6).map((t) => (
                  <li
                    key={`${t.href ?? t.name}-${t.priceUsdCents}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-vault-800 py-1.5"
                  >
                    <span className="min-w-0 text-zinc-300">
                      {t.name}
                      {t.gradeLabel ? (
                        <span className="ml-2 text-xs text-zinc-500">{t.gradeLabel}</span>
                      ) : null}
                    </span>
                    <span className="font-display font-semibold tabular-nums text-zinc-100">
                      {usd(t.priceUsdCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            All figures are the Renaiss OS Index&apos;s own valuations
            {indexObservedAt ? ` (fetched ${indexObservedAt.slice(0, 10)})` : ''}. Attribution
            required:{' '}
            <a href={INDEX_SITE} className="underline hover:text-zinc-300" rel="noreferrer">
              Renaiss OS Index
            </a>
            .
          </p>
        </section>
      )}

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

/*
 * FMV-vs-sale spread was considered and skipped: sales.token_id never joins
 * the 300-listing marketplace sample (verified 0 matches) — recently sold
 * tokens leave, or never enter, the recency-sampled book. Revisit if the
 * marketplace collector ever covers the full book.
 */
