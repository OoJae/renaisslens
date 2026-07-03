import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Database, NewListing, NewPack, NewPull, NewSale } from '@renaisslens/db'
import { getMeta, insertSnapshot, openDb, recordSourceAttempt, runMigrations, setMeta } from '@renaisslens/db'
import { loadListings, loadPacks, loadPulls, loadSales } from '../load'
import {
  parseActivitiesHtml,
  parseMarketplaceResponse,
  parsePackDetailResponse,
  parsePacksResponse,
} from '../parsers/normalize'
import { assertNoNetwork } from '../politeClient'
import { readLatest, readManifest } from './store'

export interface MockReport {
  cycleId: string
  mode: 'mock'
  sources: { source: string; status: 'ok' | 'failed'; detail: string }[]
}

/** What a demo snapshot parses into, per source kind. */
type ParsedDemo =
  | { kind: 'packs'; packs: NewPack[] }
  | { kind: 'pack-detail'; pack: NewPack; pulls: NewPull[] }
  | { kind: 'marketplace'; listings: NewListing[] }
  | { kind: 'sales'; sales: NewSale[] }

/**
 * Replays the COMMITTED demo snapshots through the identical zod→normalize→load
 * path the live cycle uses. Zero network — fetch is replaced with a throwing
 * stub so any accidental call fails loudly.
 *
 * If the DB already holds LIVE data, the replay is skipped: stale demo values
 * must never overwrite a real ingestion run (`pnpm db:reset` forces a replay
 * onto a fresh DB).
 */
export function runMock(opts: { db?: Database } = {}): MockReport {
  assertNoNetwork()
  const db = opts.db ?? openDb()
  runMigrations(db)
  const manifest = readManifest('demo')

  if (getMeta(db, 'data_mode') === 'live') {
    if (opts.db === undefined) db.close()
    return {
      cycleId: 'mock:skipped',
      mode: 'mock',
      sources: [
        {
          source: '(all)',
          status: 'ok',
          detail: 'skipped — DB holds live data; run `pnpm db:reset` to replay the demo set',
        },
      ],
    }
  }

  // replay in capture order, not alphabetical — keeps first_seen/last_seen
  // and metric history chronologically sane
  const sources = Object.keys(manifest.sources).sort((a, b) => {
    const fa = manifest.sources[a]?.fetchedAt ?? ''
    const fb = manifest.sources[b]?.fetchedAt ?? ''
    return fa.localeCompare(fb)
  })
  const reports: MockReport['sources'] = []
  if (sources.length === 0) {
    reports.push({
      source: '(none)',
      status: 'failed',
      detail: 'no demo snapshots found — data/snapshots/demo/ is empty',
    })
  }

  for (const source of sources) {
    try {
      const snap = readLatest('demo', source)
      if (!snap) throw new Error('manifest entry present but snapshot unreadable')
      const { meta } = snap
      const now = meta.fetchedAt
      const entry = manifest.sources[source]
      const relDir = join('demo', entry?.latest ?? '')

      // parse FIRST — a snapshots row must never claim ok for bytes that
      // failed to parse
      let parsed: ParsedDemo
      if (source === 'api-packs') {
        parsed = { kind: 'packs', packs: parsePacksResponse(snap.readRaw('raw.json').toString('utf8')) }
      } else if (source.startsWith('api-pack-detail:')) {
        parsed = { kind: 'pack-detail', ...parsePackDetailResponse(snap.readRaw('raw.json').toString('utf8')) }
      } else if (source === 'api-marketplace') {
        const listings: NewListing[] = []
        for (const file of meta.files.filter((f) => f.startsWith('page-'))) {
          listings.push(...parseMarketplaceResponse(snap.readRaw(file).toString('utf8')).listings)
        }
        parsed = { kind: 'marketplace', listings }
      } else if (source === 'site-home-activities') {
        const sales =
          meta.extraction === 'dom'
            ? ((snap.parsed ?? []) as NewSale[]) // DOM demo rows are pre-parsed
            : parseActivitiesHtml(gunzipSync(snap.readRaw('raw.html.gz')).toString('utf8'))
        parsed = { kind: 'sales', sales }
      } else {
        reports.push({ source, status: 'failed', detail: 'unknown source kind — skipped' })
        continue
      }

      const snapshotId = insertSnapshot(db, {
        source,
        cycleId: `mock:${meta.cycleId}`,
        url: meta.url,
        rawPath: join(relDir, meta.files[0] ?? 'meta.json'),
        contentSha256: meta.contentSha256,
        httpStatus: meta.httpStatus,
        fetchedAt: now,
        status: 'ok',
      })

      let detail: string
      switch (parsed.kind) {
        case 'packs': {
          const { upserted } = loadPacks(db, parsed.packs, snapshotId, now)
          detail = `${upserted} packs`
          break
        }
        case 'pack-detail': {
          loadPacks(db, [parsed.pack], snapshotId, now)
          const stats = loadPulls(db, parsed.pulls, snapshotId, now)
          detail = `${stats.inserted}/${stats.returned} pulls`
          break
        }
        case 'marketplace': {
          const { upserted } = loadListings(db, parsed.listings, snapshotId, now)
          detail = `${upserted} listings`
          break
        }
        case 'sales': {
          const stats = loadSales(db, parsed.sales, snapshotId, now)
          detail = `${stats.inserted}/${stats.returned} sales`
          break
        }
      }

      recordSourceAttempt(db, source, { status: 'ok', snapshotId }, now)
      reports.push({ source, status: 'ok', detail })
    } catch (err) {
      reports.push({
        source,
        status: 'failed',
        detail: String(err instanceof Error ? err.message : err).slice(0, 300),
      })
    }
  }

  setMeta(db, 'data_mode', 'mock')
  if (manifest.updatedAt) setMeta(db, 'demo_captured_at', manifest.updatedAt)
  if (opts.db === undefined) db.close()
  return { cycleId: `mock:${manifest.updatedAt}`, mode: 'mock', sources: reports }
}
