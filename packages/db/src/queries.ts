import type { Database } from 'better-sqlite3'
import type {
  DataMode,
  ListingRow,
  NewListing,
  NewPack,
  NewPull,
  NewSale,
  NewSnapshot,
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
  return db
    .prepare(`SELECT * FROM pack_pulls WHERE pack_slug = ? ORDER BY pulled_at DESC LIMIT ?`)
    .all(slug, limit) as PullRow[]
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
    ).run({ tokenId: l.tokenId, askPriceCents: l.askPriceCents, fmvCents: l.fmvCents, now, snapshotId })
  }
}

/** Listings whose ask diverges from FMV by at least `minRatio` (both prices present). */
export function mispricedListings(db: Database, minRatio: number, limit = 50): ListingRow[] {
  return db
    .prepare(
      `SELECT * FROM listings
       WHERE ask_price_cents IS NOT NULL AND fmv_cents IS NOT NULL AND fmv_cents > 0
         AND (CAST(ask_price_cents AS REAL) / fmv_cents >= @minRatio
              OR CAST(fmv_cents AS REAL) / ask_price_cents >= @minRatio)
       ORDER BY CAST(ask_price_cents AS REAL) / fmv_cents DESC
       LIMIT @limit`,
    )
    .all({ minRatio, limit }) as ListingRow[]
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
