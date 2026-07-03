import type { Database } from '@renaisslens/db'
import {
  insertSnapshot,
  listPackSlugs,
  openDb,
  recordSourceAttempt,
  runMigrations,
  setMeta,
} from '@renaisslens/db'
import { ZodError } from 'zod'
import { getHomepage, getMarketplacePage, getPackDetail, getPacks } from './api/client'
import { CONFIG } from './config'
import { runEv } from './ev'
import { loadListings, loadPacks, loadPulls, loadSales } from './load'
import { MoneyParseError } from './parsers/money'
import {
  ActivitiesShapeError,
  parseActivitiesHtml,
  parseMarketplaceResponse,
  parsePackDetailResponse,
  parsePacksResponse,
} from './parsers/normalize'
import { scrapeActivitiesDom } from './site/activitiesDom'
import { FlightParseError } from './site/flight'
import { writeSnapshot } from './snapshots/store'

export interface SourceReport {
  source: string
  status: 'ok' | 'failed' | 'quarantined'
  detail: string
}

export interface CycleReport {
  cycleId: string
  mode: 'live'
  startedAt: string
  finishedAt: string
  sources: SourceReport[]
}

const isQuarantineError = (err: unknown): boolean =>
  err instanceof ZodError ||
  err instanceof MoneyParseError ||
  err instanceof FlightParseError ||
  err instanceof ActivitiesShapeError ||
  err instanceof SyntaxError // JSON.parse of a non-JSON body

function shortError(err: unknown): string {
  if (err instanceof ZodError) {
    return `zod: ${err.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')}${err.issues.length > 3 ? ` (+${err.issues.length - 3} more)` : ''}`
  }
  return String(err instanceof Error ? err.message : err).slice(0, 400)
}

/**
 * Persist an ok snapshot (disk + snapshots table). Freshness is recorded by
 * the caller AFTER the domain load succeeds — otherwise source_status could
 * attest to data that never landed.
 */
function commitOk(
  db: Database,
  args: {
    source: string
    cycleId: string
    url: string
    fetchedAt: string
    httpStatus: number | null
    raw: { name: string; body: string; gzip?: boolean }[]
    parsed: unknown
    extraction?: string
  },
): number {
  const snap = writeSnapshot({ root: 'live', status: 'ok', ...args })
  return insertSnapshot(db, {
    source: args.source,
    cycleId: args.cycleId,
    url: args.url,
    rawPath: snap.rawPath,
    parsedPath: `${snap.relDir}/parsed.json`,
    contentSha256: snap.contentSha256,
    httpStatus: args.httpStatus,
    fetchedAt: args.fetchedAt,
    status: 'ok',
  })
}

function commitQuarantine(
  db: Database,
  args: {
    source: string
    cycleId: string
    url: string
    fetchedAt: string
    httpStatus: number | null
    raw: { name: string; body: string; gzip?: boolean }[]
    error: string
  },
): void {
  const snap = writeSnapshot({ root: 'live', status: 'quarantined', parsed: undefined, ...args })
  const snapshotId = insertSnapshot(db, {
    source: args.source,
    cycleId: args.cycleId,
    url: args.url,
    rawPath: snap.rawPath,
    contentSha256: snap.contentSha256,
    httpStatus: args.httpStatus,
    fetchedAt: args.fetchedAt,
    status: 'quarantined',
    error: args.error,
  })
  recordSourceAttempt(
    db,
    args.source,
    { status: 'quarantined', error: args.error, snapshotId },
    args.fetchedAt,
  )
}

export const SOURCE_GROUPS = [
  'api-packs',
  'api-pack-details',
  'api-marketplace',
  'site-home-activities',
] as const

export async function runCycle(opts: { only?: string; db?: Database } = {}): Promise<CycleReport> {
  if (
    opts.only !== undefined &&
    !SOURCE_GROUPS.includes(opts.only as (typeof SOURCE_GROUPS)[number])
  ) {
    throw new Error(
      `unknown --source "${opts.only}" — expected one of: ${SOURCE_GROUPS.join(', ')}`,
    )
  }
  const db = opts.db ?? openDb()
  runMigrations(db)
  const startedAt = new Date().toISOString()
  const cycleId = startedAt
  const reports: SourceReport[] = []
  const want = (source: string) => opts.only === undefined || opts.only === source

  // ── 1. packs ───────────────────────────────────────────────────────────────
  let detailSlugs: string[] = []
  if (want('api-packs')) {
    const source = 'api-packs'
    try {
      const res = await getPacks()
      try {
        const packs = parsePacksResponse(res.rawText)
        const snapshotId = commitOk(db, {
          source,
          cycleId,
          url: res.url,
          fetchedAt: res.fetchedAt,
          httpStatus: res.status,
          raw: [{ name: 'raw.json', body: res.rawText }],
          parsed: packs,
        })
        const { upserted, historyAppends } = loadPacks(db, packs, snapshotId, res.fetchedAt)
        recordSourceAttempt(db, source, { status: 'ok', snapshotId }, res.fetchedAt)
        detailSlugs = packs.filter((p) => p.stage !== 'archived').map((p) => p.slug)
        reports.push({
          source,
          status: 'ok',
          detail: `${upserted} packs upserted, ${historyAppends} metric-history appends`,
        })
      } catch (err) {
        if (!isQuarantineError(err)) throw err
        commitQuarantine(db, {
          source,
          cycleId,
          url: res.url,
          fetchedAt: res.fetchedAt,
          httpStatus: res.status,
          raw: [{ name: 'raw.json', body: res.rawText }],
          error: shortError(err),
        })
        reports.push({ source, status: 'quarantined', detail: shortError(err) })
      }
    } catch (err) {
      recordSourceAttempt(
        db,
        source,
        { status: 'failed', error: shortError(err) },
        new Date().toISOString(),
      )
      reports.push({ source, status: 'failed', detail: shortError(err) })
    }
  }
  if (detailSlugs.length === 0) {
    // packs fetch failed/skipped → fall back to slugs already known to the DB
    detailSlugs = listPackSlugs(db)
  }

  // ── 2. pack details (pull feed) ───────────────────────────────────────────
  if (want('api-pack-details')) {
    for (const slug of detailSlugs.slice(0, 8)) {
      const source = `api-pack-detail:${slug}`
      try {
        const res = await getPackDetail(slug)
        try {
          const { pack, pulls } = parsePackDetailResponse(res.rawText)
          const snapshotId = commitOk(db, {
            source,
            cycleId,
            url: res.url,
            fetchedAt: res.fetchedAt,
            httpStatus: res.status,
            raw: [{ name: 'raw.json', body: res.rawText }],
            parsed: { pack, pulls },
          })
          loadPacks(db, [pack], snapshotId, res.fetchedAt)
          const stats = loadPulls(db, pulls, snapshotId, res.fetchedAt)
          recordSourceAttempt(db, source, { status: 'ok', snapshotId }, res.fetchedAt)
          reports.push({
            source,
            status: 'ok',
            detail: `${stats.inserted}/${stats.returned} pulls new${stats.windowLikelyOverflowed ? ' — WINDOW MAY HAVE OVERFLOWED (zero overlap)' : ''}`,
          })
        } catch (err) {
          if (!isQuarantineError(err)) throw err
          commitQuarantine(db, {
            source,
            cycleId,
            url: res.url,
            fetchedAt: res.fetchedAt,
            httpStatus: res.status,
            raw: [{ name: 'raw.json', body: res.rawText }],
            error: shortError(err),
          })
          reports.push({ source, status: 'quarantined', detail: shortError(err) })
        }
      } catch (err) {
        recordSourceAttempt(
          db,
          source,
          { status: 'failed', error: shortError(err) },
          new Date().toISOString(),
        )
        reports.push({ source, status: 'failed', detail: shortError(err) })
      }
    }
  }

  // ── 3. marketplace (top-N pages by list date — a labeled sample) ──────────
  if (want('api-marketplace')) {
    const source = 'api-marketplace'
    const url = `${CONFIG.apiBaseUrl}/v0/marketplace (${CONFIG.marketplacePages} pages)`
    // hoisted so the catch can quarantine every raw byte fetched so far,
    // including the page that failed to parse
    const pages: { name: string; body: string }[] = []
    try {
      const allListings = []
      let total = 0
      for (let i = 0; i < CONFIG.marketplacePages; i++) {
        const res = await getMarketplacePage(
          i * CONFIG.marketplacePageSize,
          CONFIG.marketplacePageSize,
        )
        pages.push({ name: `page-${i}.json`, body: res.rawText })
        const { listings, total: t } = parseMarketplaceResponse(res.rawText) // throws → quarantine below
        allListings.push(...listings)
        total = t
      }
      const fetchedAt = new Date().toISOString()
      const snapshotId = commitOk(db, {
        source,
        cycleId,
        url,
        fetchedAt,
        httpStatus: 200,
        raw: pages,
        parsed: allListings,
      })
      const { upserted } = loadListings(db, allListings, snapshotId, fetchedAt)
      recordSourceAttempt(db, source, { status: 'ok', snapshotId }, fetchedAt)
      reports.push({
        source,
        status: 'ok',
        detail: `${upserted} listings upserted (sample of ${total} total)`,
      })
    } catch (err) {
      if (isQuarantineError(err) && pages.length > 0) {
        commitQuarantine(db, {
          source,
          cycleId,
          url,
          fetchedAt: new Date().toISOString(),
          httpStatus: 200,
          raw: pages,
          error: shortError(err),
        })
        reports.push({ source, status: 'quarantined', detail: shortError(err) })
      } else {
        // network error or infra failure (disk, SQLITE_BUSY) — not a data-shape problem
        recordSourceAttempt(
          db,
          source,
          { status: 'failed', error: shortError(err) },
          new Date().toISOString(),
        )
        reports.push({ source, status: 'failed', detail: shortError(err) })
      }
    }
  }

  // ── 4. homepage Latest Activities (flight-first, DOM fallback) ────────────
  if (want('site-home-activities')) {
    const source = 'site-home-activities'
    try {
      const res = await getHomepage()
      try {
        const sales = parseActivitiesHtml(res.rawText)
        const snapshotId = commitOk(db, {
          source,
          cycleId,
          url: res.url,
          fetchedAt: res.fetchedAt,
          httpStatus: res.status,
          raw: [{ name: 'raw.html', body: res.rawText, gzip: true }],
          parsed: sales,
          extraction: 'flight',
        })
        const stats = loadSales(db, sales, snapshotId, res.fetchedAt)
        recordSourceAttempt(db, source, { status: 'ok', snapshotId }, res.fetchedAt)
        reports.push({
          source,
          status: 'ok',
          detail: `${stats.inserted}/${stats.returned} sales new (flight extraction)`,
        })
      } catch (err) {
        if (!isQuarantineError(err)) throw err
        commitQuarantine(db, {
          source,
          cycleId,
          url: res.url,
          fetchedAt: res.fetchedAt,
          httpStatus: res.status,
          raw: [{ name: 'raw.html', body: res.rawText, gzip: true }],
          error: shortError(err),
        })
        reports.push({ source, status: 'quarantined', detail: `flight: ${shortError(err)}` })
        // automatic fallback: Playwright DOM extraction (lower confidence)
        try {
          const dom = await scrapeActivitiesDom()
          if (dom.sales.length === 0) throw new Error('DOM fallback extracted 0 rows')
          const snapshotId = commitOk(db, {
            source,
            cycleId,
            url: CONFIG.siteBaseUrl,
            fetchedAt: dom.fetchedAt,
            httpStatus: null,
            raw: [{ name: 'raw.html', body: dom.html, gzip: true }],
            parsed: dom.sales,
            extraction: 'dom',
          })
          const stats = loadSales(db, dom.sales, snapshotId, dom.fetchedAt)
          recordSourceAttempt(db, source, { status: 'ok', snapshotId }, dom.fetchedAt)
          reports.push({
            source,
            status: 'ok',
            detail: `${stats.inserted}/${stats.returned} sales new (DOM fallback — lower confidence)`,
          })
        } catch (domErr) {
          reports.push({
            source,
            status: 'quarantined',
            detail: `dom fallback also failed: ${shortError(domErr)}`,
          })
        }
      }
    } catch (err) {
      recordSourceAttempt(
        db,
        source,
        { status: 'failed', error: shortError(err) },
        new Date().toISOString(),
      )
      reports.push({ source, status: 'failed', detail: shortError(err) })
    }
  }

  // only claim live mode when at least one source actually ingested live data
  if (reports.some((r) => r.status === 'ok')) {
    setMeta(db, 'data_mode', 'live')
    // Recompute EV only when a source that changes EV inputs (packs or pulls)
    // succeeded — a marketplace- or activities-only sweep (watch mode runs each
    // source on its own cadence) leaves the model unchanged, so recomputing
    // would only append identical history rows and burn cycles.
    const evInputsChanged = reports.some(
      (r) =>
        r.status === 'ok' && (r.source === 'api-packs' || r.source.startsWith('api-pack-detail:')),
    )
    if (evInputsChanged) {
      // fresh EV inputs → recompute ranges. An EV failure must never fail ingestion.
      try {
        reports.push(...runEv({ db }).sources)
      } catch (err) {
        reports.push({ source: 'ev-engine', status: 'failed', detail: shortError(err) })
      }
    }
  }
  const finishedAt = new Date().toISOString()
  if (opts.db === undefined) db.close()
  return { cycleId, mode: 'live', startedAt, finishedAt, sources: reports }
}

export function printReport(report: { cycleId: string; sources: SourceReport[] }): number {
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(`\ncycle ${report.cycleId}`)
  console.log('─'.repeat(96))
  for (const r of report.sources) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'failed' ? '✗' : '⚠'
    console.log(`${icon} ${pad(r.source, 30)} ${pad(r.status, 12)} ${r.detail}`)
  }
  console.log('─'.repeat(96))
  const failed = report.sources.filter((r) => r.status !== 'ok').length
  if (failed === 0) return 0
  return failed === report.sources.length ? 1 : 2
}
