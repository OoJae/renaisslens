import type { Database } from 'better-sqlite3'
import type {
  DataMode,
  EvRunHistoryRow,
  EvRunRow,
  IndexMarketRow,
  IndexPriceRow,
  ListingAnomalyRow,
  NewEvRun,
  NewIndexPrice,
  NewListing,
  NewPack,
  NewPull,
  NewSale,
  NewSnapshot,
  ObservatoryPullRow,
  PackRow,
  PullRow,
  SaleRow,
  SourceFreshness,
  TierBucket,
} from './types'

// ── snapshots ────────────────────────────────────────────────────────────────

export function insertSnapshot(db: Database, s: NewSnapshot): number {
  const res = db
    .prepare(
      `INSERT INTO snapshots (source, cycle_id, url, raw_path, parsed_path, content_sha256, http_status, fetched_at, status, error)
       VALUES (@source, @cycleId, @url, @rawPath, @parsedPath, @contentSha256, @httpStatus, @fetchedAt, @status, @error)`,
    )
    .run({
      parsedPath: null,
      httpStatus: null,
      error: null,
      ...s,
    })
  return Number(res.lastInsertRowid)
}

// ── packs ────────────────────────────────────────────────────────────────────

export function upsertPack(db: Database, p: NewPack, snapshotId: number, now: string): void {
  db.prepare(
    `INSERT INTO packs (slug, name, pack_type, stage, description, author, price_cents,
                        expected_value_cents, featured_card_fmv_cents, first_seen_at, last_seen_at, snapshot_id)
     VALUES (@slug, @name, @packType, @stage, @description, @author, @priceCents,
             @expectedValueCents, @featuredCardFmvCents, @now, @now, @snapshotId)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name,
       pack_type = excluded.pack_type,
       stage = excluded.stage,
       description = excluded.description,
       author = excluded.author,
       price_cents = excluded.price_cents,
       expected_value_cents = excluded.expected_value_cents,
       featured_card_fmv_cents = excluded.featured_card_fmv_cents,
       last_seen_at = excluded.last_seen_at,
       snapshot_id = excluded.snapshot_id`,
  ).run({ ...p, snapshotId, now })
}

/** Append a metric-history row only when the observable tuple changed. Returns true if appended. */
export function appendPackMetricsIfChanged(
  db: Database,
  p: NewPack,
  snapshotId: number,
  now: string,
): boolean {
  const latest = db
    .prepare(
      `SELECT price_cents, expected_value_cents, featured_card_fmv_cents, stage
       FROM pack_metric_history WHERE pack_slug = ? ORDER BY observed_at DESC, id DESC LIMIT 1`,
    )
    .get(p.slug) as
    | {
        price_cents: number
        expected_value_cents: number | null
        featured_card_fmv_cents: number | null
        stage: string
      }
    | undefined
  const unchanged =
    latest !== undefined &&
    latest.price_cents === p.priceCents &&
    latest.expected_value_cents === p.expectedValueCents &&
    latest.featured_card_fmv_cents === p.featuredCardFmvCents &&
    latest.stage === p.stage
  if (unchanged) return false
  db.prepare(
    `INSERT INTO pack_metric_history (pack_slug, price_cents, expected_value_cents, featured_card_fmv_cents, stage, observed_at, snapshot_id)
     VALUES (@slug, @priceCents, @expectedValueCents, @featuredCardFmvCents, @stage, @now, @snapshotId)`,
  ).run({
    slug: p.slug,
    priceCents: p.priceCents,
    expectedValueCents: p.expectedValueCents,
    featuredCardFmvCents: p.featuredCardFmvCents,
    stage: p.stage,
    now,
    snapshotId,
  })
  return true
}

export function listPacks(db: Database): PackRow[] {
  return db.prepare(`SELECT * FROM packs ORDER BY price_cents ASC`).all() as PackRow[]
}

export function listPackSlugs(db: Database, excludeStages: string[] = ['archived']): string[] {
  const placeholders = excludeStages.map(() => '?').join(',')
  const sql =
    excludeStages.length > 0
      ? `SELECT slug FROM packs WHERE stage NOT IN (${placeholders}) ORDER BY stage ASC, slug ASC`
      : `SELECT slug FROM packs ORDER BY slug ASC`
  return (db.prepare(sql).all(...excludeStages) as { slug: string }[]).map((r) => r.slug)
}

// ── pack pulls ───────────────────────────────────────────────────────────────

/** INSERT OR IGNORE batch; returns overlap stats used to measure feed completeness. */
export function insertPullsDedup(
  db: Database,
  pulls: NewPull[],
  snapshotId: number,
  now: string,
): { returned: number; inserted: number } {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO pack_pulls (pack_slug, collectible_token_id, tier, fmv_cents, pulled_at, first_seen_at, snapshot_id)
     VALUES (@packSlug, @collectibleTokenId, @tier, @fmvCents, @pulledAt, @now, @snapshotId)`,
  )
  let inserted = 0
  const run = db.transaction((rows: NewPull[]) => {
    for (const row of rows) {
      const res = stmt.run({ ...row, now, snapshotId })
      inserted += res.changes
    }
  })
  run(pulls)
  return { returned: pulls.length, inserted }
}

export function latestPulls(db: Database, slug: string, limit: number): PullRow[] {
  // secondary key id DESC makes the LIMIT cutoff deterministic when many pulls
  // share a pulled_at second (common — the feed stamps whole seconds), so the
  // window fed to the EV engine is stable per data state.
  return db
    .prepare(
      `SELECT * FROM pack_pulls WHERE pack_slug = ? ORDER BY pulled_at DESC, id DESC LIMIT ?`,
    )
    .all(slug, limit) as PullRow[]
}

export function countPullsForPack(db: Database, slug: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM pack_pulls WHERE pack_slug = ?`).get(slug) as {
    n: number
  }
  return row.n
}

export function tierDistribution(db: Database, slug: string): TierBucket[] {
  return db
    .prepare(
      `SELECT tier, COUNT(*) AS n, CAST(AVG(fmv_cents) AS INTEGER) AS avg_fmv_cents,
              MIN(fmv_cents) AS min_fmv_cents, MAX(fmv_cents) AS max_fmv_cents
       FROM pack_pulls WHERE pack_slug = ? GROUP BY tier ORDER BY avg_fmv_cents DESC`,
    )
    .all(slug) as TierBucket[]
}

/**
 * Every observed pull, raw (unrounded fmv_cents), for the fairness observatory.
 * One tab-level read grouped in TS — avoids N+1 per-pack calls and the integer
 * rounding of tierDistribution's AVG (which would bias the observed-mean CI).
 * Deterministic `id` order keeps the seeded bootstrap reproducible.
 */
export function observatoryPulls(db: Database): ObservatoryPullRow[] {
  return db
    .prepare(`SELECT pack_slug, tier, fmv_cents FROM pack_pulls ORDER BY pack_slug ASC, id ASC`)
    .all() as ObservatoryPullRow[]
}

// ── listings ─────────────────────────────────────────────────────────────────

export function upsertListing(db: Database, l: NewListing, snapshotId: number, now: string): void {
  const prev = db
    .prepare(`SELECT ask_price_cents, fmv_cents FROM listings WHERE token_id = ?`)
    .get(l.tokenId) as { ask_price_cents: number | null; fmv_cents: number | null } | undefined
  db.prepare(
    `INSERT INTO listings (token_id, name, set_name, card_number, pokemon_name, grading_company, grade, year,
                           language, vault_location, owner_address, owner_username, ask_price_cents,
                           ask_expires_at, fmv_cents, attributes_json, first_seen_at, observed_at, snapshot_id)
     VALUES (@tokenId, @name, @setName, @cardNumber, @pokemonName, @gradingCompany, @grade, @year,
             @language, @vaultLocation, @ownerAddress, @ownerUsername, @askPriceCents,
             @askExpiresAt, @fmvCents, @attributesJson, @now, @now, @snapshotId)
     ON CONFLICT(token_id) DO UPDATE SET
       name = excluded.name, set_name = excluded.set_name, card_number = excluded.card_number,
       pokemon_name = excluded.pokemon_name, grading_company = excluded.grading_company,
       grade = excluded.grade, year = excluded.year, language = excluded.language,
       vault_location = excluded.vault_location, owner_address = excluded.owner_address,
       owner_username = excluded.owner_username, ask_price_cents = excluded.ask_price_cents,
       ask_expires_at = excluded.ask_expires_at, fmv_cents = excluded.fmv_cents,
       attributes_json = excluded.attributes_json, observed_at = excluded.observed_at,
       snapshot_id = excluded.snapshot_id`,
  ).run({ ...l, now, snapshotId })
  const changed =
    prev === undefined || prev.ask_price_cents !== l.askPriceCents || prev.fmv_cents !== l.fmvCents
  if (changed) {
    db.prepare(
      `INSERT INTO listing_history (token_id, ask_price_cents, fmv_cents, observed_at, snapshot_id)
       VALUES (@tokenId, @askPriceCents, @fmvCents, @now, @snapshotId)`,
    ).run({
      tokenId: l.tokenId,
      askPriceCents: l.askPriceCents,
      fmvCents: l.fmvCents,
      now,
      snapshotId,
    })
  }
}

/**
 * Listings whose ask diverges from Renaiss's FMV in EITHER direction, ranked
 * by symmetric divergence max(ratio, 1/ratio). Surfaced as "listing anomaly"
 * — transparency, never advice. (Replaces the one-directional
 * mispricedListings, whose ask/fmv-DESC ordering starved the below-FMV side.)
 */
export function listingAnomalies(db: Database, minRatio: number, limit = 50): ListingAnomalyRow[] {
  return db
    .prepare(
      `SELECT *,
         CAST(ask_price_cents AS REAL) / fmv_cents AS ratio,
         MAX(CAST(ask_price_cents AS REAL) / fmv_cents,
             CAST(fmv_cents AS REAL) / ask_price_cents) AS divergence,
         CASE WHEN ask_price_cents >= fmv_cents THEN 'above-fmv' ELSE 'below-fmv' END AS direction
       FROM listings
       WHERE ask_price_cents IS NOT NULL AND fmv_cents IS NOT NULL
         AND fmv_cents > 0 AND ask_price_cents > 0
         AND MAX(CAST(ask_price_cents AS REAL) / fmv_cents,
                 CAST(fmv_cents AS REAL) / ask_price_cents) >= @minRatio
       ORDER BY divergence DESC
       LIMIT @limit`,
    )
    .all({ minRatio, limit }) as ListingAnomalyRow[]
}

/** Median ask/FMV across listings with both prices — a context stat for the EV haircut assumption. */
export function medianAskToFmvRatio(db: Database): number | null {
  const rows = db
    .prepare(
      `SELECT CAST(ask_price_cents AS REAL) / fmv_cents AS ratio
       FROM listings
       WHERE ask_price_cents IS NOT NULL AND fmv_cents IS NOT NULL AND fmv_cents > 0
       ORDER BY ratio`,
    )
    .all() as { ratio: number }[]
  const ratios = rows.map((r) => r.ratio)
  const mid = Math.floor(ratios.length / 2)
  const hi = ratios[mid]
  if (hi === undefined) return null
  const lo = ratios[mid - 1]
  return ratios.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2
}

// ── sales ────────────────────────────────────────────────────────────────────

export function insertSalesDedup(
  db: Database,
  sales: NewSale[],
  snapshotId: number,
  now: string,
): { returned: number; inserted: number } {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO sales (activity_id, token_id, card_title, set_name, grade, grading_company,
                                  price_cents, pct_change, sold_at, observed_at, source, snapshot_id)
     VALUES (@activityId, @tokenId, @cardTitle, @setName, @grade, @gradingCompany,
             @priceCents, @pctChange, @soldAt, @now, @source, @snapshotId)`,
  )
  let inserted = 0
  const run = db.transaction((rows: NewSale[]) => {
    for (const row of rows) {
      const res = stmt.run({ ...row, now, snapshotId })
      inserted += res.changes
    }
  })
  run(sales)
  return { returned: sales.length, inserted }
}

export function recentSales(db: Database, limit: number): SaleRow[] {
  return db
    .prepare(`SELECT * FROM sales ORDER BY COALESCE(sold_at, observed_at) DESC LIMIT ?`)
    .all(limit) as SaleRow[]
}

/** Newest sale timestamp — the anchor for feed-relative windows (never wall-clock: demo data is fixed in time). */
export function latestSaleAt(db: Database): string | null {
  const row = db.prepare(`SELECT MAX(COALESCE(sold_at, observed_at)) AS t FROM sales`).get() as {
    t: string | null
  }
  return row.t
}

/** Sales at/after the ISO cutoff. Filter/order use the exact idx_sales_time expression; id DESC pins tie order. */
export function salesSince(db: Database, isoCutoff: string): SaleRow[] {
  return db
    .prepare(
      `SELECT * FROM sales WHERE COALESCE(sold_at, observed_at) >= ?
       ORDER BY COALESCE(sold_at, observed_at) DESC, id DESC`,
    )
    .all(isoCutoff) as SaleRow[]
}

/**
 * How much scrape history backs the sales feed — drives the honest-degradation
 * copy: 1 snapshot → "a snapshot, not a trend"; more → "aggregated across N scrapes".
 */
export function salesBatchInfo(db: Database): {
  snapshotCount: number
  firstObservedAt: string | null
  lastObservedAt: string | null
} {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT snapshot_id) AS n, MIN(observed_at) AS first_at, MAX(observed_at) AS last_at
       FROM sales`,
    )
    .get() as { n: number; first_at: string | null; last_at: string | null }
  return { snapshotCount: row.n, firstObservedAt: row.first_at, lastObservedAt: row.last_at }
}

// ── ev runs ──────────────────────────────────────────────────────────────────

export function insertEvRun(db: Database, r: NewEvRun, now: string): number {
  const res = db
    .prepare(
      `INSERT INTO ev_runs (pack_slug, scenario, p10_cents, p50_cents, p90_cents,
                            prob_break_even, prob_top_prize, prob_ev_above_price, ev_mean_cents,
                            iterations, seed, params_json, assumptions_json, input_snapshot_ids, ran_at)
       VALUES (@packSlug, @scenario, @p10Cents, @p50Cents, @p90Cents,
               @probBreakEven, @probTopPrize, @probEvAbovePrice, @evMeanCents,
               @iterations, @seed, @paramsJson, @assumptionsJson, @inputSnapshotIdsJson, @now)`,
    )
    .run({ inputSnapshotIdsJson: null, ...r, now })
  return Number(res.lastInsertRowid)
}

/** Newest run per (pack, scenario) — THE dashboard read path. Runs are history; reads are latest. */
export function latestEvRuns(db: Database): EvRunRow[] {
  return db
    .prepare(
      `SELECT * FROM ev_runs
       WHERE id IN (SELECT MAX(id) FROM ev_runs GROUP BY pack_slug, scenario)
       ORDER BY pack_slug ASC, scenario ASC`,
    )
    .all() as EvRunRow[]
}

/**
 * Full append-only history for one (pack, scenario), oldest→newest — the
 * confidence-over-time read. Lean columns only: `params_json` carries the whole
 * histogram per row, so `SELECT *` would bloat the payload N×. `observed_pull_count`
 * is extracted from `assumptions_json` in TS (SQLite's json_extract throws on a
 * malformed blob; the TS parser degrades gracefully instead). Uses the existing
 * idx_ev_runs_pack_scenario_time index; `id` tiebreaks equal `ran_at`.
 */
export function evRunHistory(db: Database, packSlug: string, scenario: string): EvRunHistoryRow[] {
  return db
    .prepare(
      `SELECT id, ran_at, p10_cents, p50_cents, p90_cents, assumptions_json
       FROM ev_runs WHERE pack_slug = ? AND scenario = ?
       ORDER BY ran_at ASC, id ASC`,
    )
    .all(packSlug, scenario) as EvRunHistoryRow[]
}

// ── renaiss os index (external cross-pricing) ──────────────────────────────────

export interface DistinctListingCard {
  name: string
  pokemon_name: string | null
  set_name: string
  card_number: string
  grading_company: string
  grade: string
  language: string | null
  ask_price_cents: number | null
  fmv_cents: number | null
}

/** Distinct graded cards from listings (full identity), richest first — the set to cross-reference. */
export function distinctListingCards(db: Database, limit: number): DistinctListingCard[] {
  return db
    .prepare(
      `SELECT name, pokemon_name, set_name, card_number, grading_company, grade, language,
              MAX(ask_price_cents) AS ask_price_cents, MAX(fmv_cents) AS fmv_cents
       FROM listings
       WHERE grading_company IS NOT NULL AND grade IS NOT NULL
         AND set_name IS NOT NULL AND card_number IS NOT NULL
       GROUP BY grading_company, grade, set_name, card_number, language
       ORDER BY ask_price_cents DESC
       LIMIT ?`,
    )
    .all(limit) as DistinctListingCard[]
}

/** Upsert one matched Index reference price (latest wins per card identity). */
export function upsertIndexPrice(db: Database, p: NewIndexPrice, now: string): void {
  db.prepare(
    `INSERT INTO index_prices (match_key, game, name, set_name, card_number, grading_company,
                               grade, price_cents, currency, confidence, delta_pct, last_sale_at,
                               href, observed_at)
     VALUES (@matchKey, @game, @name, @setName, @cardNumber, @gradingCompany,
             @grade, @priceCents, @currency, @confidence, @deltaPct, @lastSaleAt, @href, @now)
     ON CONFLICT(match_key) DO UPDATE SET
       game = excluded.game, name = excluded.name, set_name = excluded.set_name,
       card_number = excluded.card_number, grading_company = excluded.grading_company,
       grade = excluded.grade, price_cents = excluded.price_cents, currency = excluded.currency,
       confidence = excluded.confidence, delta_pct = excluded.delta_pct,
       last_sale_at = excluded.last_sale_at, href = excluded.href, observed_at = excluded.observed_at`,
  ).run({ ...p, now })
}

/** All Index prices — the web layer builds a Map<match_key, row> to join listings in TS. */
export function allIndexPrices(db: Database): IndexPriceRow[] {
  return db.prepare(`SELECT * FROM index_prices`).all() as IndexPriceRow[]
}

/** Store the latest display-only market payload (indices / recent trades) for a kind. */
export function replaceIndexMarket(
  db: Database,
  kind: string,
  payloadJson: string,
  now: string,
): void {
  db.prepare(
    `INSERT INTO index_market (kind, payload_json, observed_at) VALUES (?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET payload_json = excluded.payload_json, observed_at = excluded.observed_at`,
  ).run(kind, payloadJson, now)
}

export function getIndexMarket(db: Database, kind: string): IndexMarketRow | undefined {
  return db.prepare(`SELECT * FROM index_market WHERE kind = ?`).get(kind) as
    | IndexMarketRow
    | undefined
}

// ── source status / freshness ────────────────────────────────────────────────

export function recordSourceAttempt(
  db: Database,
  source: string,
  outcome: { status: 'ok' | 'failed' | 'quarantined'; error?: string; snapshotId?: number },
  now: string,
): void {
  db.prepare(
    `INSERT INTO source_status (source, last_attempt_at, last_success_at, last_status, last_error, consecutive_failures, latest_snapshot_id)
     VALUES (@source, @now, @successAt, @status, @error, @failures, @snapshotId)
     ON CONFLICT(source) DO UPDATE SET
       last_attempt_at = @now,
       last_success_at = COALESCE(@successAt, source_status.last_success_at),
       last_status = @status,
       last_error = @error,
       consecutive_failures = CASE WHEN @status = 'ok' THEN 0 ELSE source_status.consecutive_failures + 1 END,
       latest_snapshot_id = COALESCE(@snapshotId, source_status.latest_snapshot_id)`,
  ).run({
    source,
    now,
    successAt: outcome.status === 'ok' ? now : null,
    status: outcome.status,
    error: outcome.error ?? null,
    failures: outcome.status === 'ok' ? 0 : 1,
    snapshotId: outcome.snapshotId ?? null,
  })
}

export function getFreshness(db: Database): SourceFreshness[] {
  return db.prepare(`SELECT * FROM source_status ORDER BY source`).all() as SourceFreshness[]
}

// ── meta ─────────────────────────────────────────────────────────────────────

export function setMeta(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function getDataMode(db: Database): DataMode {
  return (getMeta(db, 'data_mode') as DataMode | null) ?? 'mock'
}

export function countRows(db: Database, table: string): number {
  const allowed = new Set([
    'snapshots',
    'packs',
    'pack_metric_history',
    'pack_pulls',
    'listings',
    'listing_history',
    'sales',
    'source_status',
    'ev_runs',
  ])
  if (!allowed.has(table)) throw new Error(`countRows: unknown table ${table}`)
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
  return row.n
}
