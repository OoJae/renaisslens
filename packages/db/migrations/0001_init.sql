-- RenaissLens schema v1.
-- Conventions:
--   * money is INTEGER cents, converted exactly (BigInt) at the ingestion boundary
--   * source-provided epochs are INTEGER unix seconds, verbatim
--   * clocks we generate are ISO-8601 UTC TEXT
--   * every data row references the snapshot (raw bytes on disk) it came from
-- Pragmas (WAL, foreign_keys, busy_timeout) are set at connection open, not here.

CREATE TABLE snapshots (
  id             INTEGER PRIMARY KEY,
  source         TEXT NOT NULL,        -- 'api-packs' | 'api-pack-detail:omega' | 'api-marketplace' | 'site-home-activities'
  cycle_id       TEXT NOT NULL,
  url            TEXT NOT NULL,
  raw_path       TEXT NOT NULL,        -- relative to data/snapshots/{live|demo}
  parsed_path    TEXT,
  content_sha256 TEXT NOT NULL,
  http_status    INTEGER,
  fetched_at     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('ok','quarantined','failed')),
  error          TEXT
);
CREATE INDEX idx_snapshots_source_time ON snapshots(source, fetched_at DESC);

CREATE TABLE packs (
  slug                    TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  pack_type               TEXT NOT NULL,       -- 'limited' | 'perpetual' (zod-enforced upstream)
  stage                   TEXT NOT NULL,       -- countdown | active | soldout-or-restocking | archived
  description             TEXT,
  author                  TEXT,
  price_cents             INTEGER NOT NULL,
  expected_value_cents    INTEGER,             -- Renaiss's OWN claimed EV (latest observation)
  featured_card_fmv_cents INTEGER,
  first_seen_at           TEXT NOT NULL,
  last_seen_at            TEXT NOT NULL,
  source                  TEXT NOT NULL DEFAULT 'api:v0/packs',
  snapshot_id             INTEGER NOT NULL REFERENCES snapshots(id)
);

-- price / EV-claim / stage over time: change-detected append
CREATE TABLE pack_metric_history (
  id                      INTEGER PRIMARY KEY,
  pack_slug               TEXT NOT NULL REFERENCES packs(slug),
  price_cents             INTEGER NOT NULL,
  expected_value_cents    INTEGER,
  featured_card_fmv_cents INTEGER,
  stage                   TEXT NOT NULL,
  observed_at             TEXT NOT NULL,
  snapshot_id             INTEGER NOT NULL REFERENCES snapshots(id)
);
CREATE INDEX idx_pmh_pack_time ON pack_metric_history(pack_slug, observed_at DESC);

-- empirical pull outcomes from /v0/packs/{slug} recentOpenedPacks
CREATE TABLE pack_pulls (
  id                   INTEGER PRIMARY KEY,
  pack_slug            TEXT NOT NULL REFERENCES packs(slug),
  collectible_token_id TEXT NOT NULL,          -- huge uint256, always TEXT
  tier                 TEXT NOT NULL,          -- TOP|S|A|B|C|D
  fmv_cents            INTEGER NOT NULL,
  pulled_at            INTEGER NOT NULL,       -- unix seconds, verbatim from source
  first_seen_at        TEXT NOT NULL,
  snapshot_id          INTEGER NOT NULL REFERENCES snapshots(id),
  -- same token can be re-pulled after buyback->restock, so pulled_at is part of the key
  UNIQUE (pack_slug, collectible_token_id, pulled_at)
);
CREATE INDEX idx_pulls_pack_time ON pack_pulls(pack_slug, pulled_at DESC);

-- marketplace: latest-state upsert; absence from a poll is NOT delisting evidence
CREATE TABLE listings (
  token_id        TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  set_name        TEXT,
  card_number     TEXT,
  pokemon_name    TEXT,
  grading_company TEXT,
  grade           TEXT,
  year            INTEGER,
  language        TEXT,
  vault_location  TEXT,
  owner_address   TEXT,
  owner_username  TEXT,
  ask_price_cents INTEGER,                     -- NULL when 'NO-ASK-PRICE'
  ask_expires_at  TEXT,
  fmv_cents       INTEGER,                     -- NULL when 'NO-FMV-PRICE'
  attributes_json TEXT,
  first_seen_at   TEXT NOT NULL,
  observed_at     TEXT NOT NULL,
  snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id)
);
CREATE INDEX idx_listings_ask ON listings(ask_price_cents) WHERE ask_price_cents IS NOT NULL;

CREATE TABLE listing_history (
  id              INTEGER PRIMARY KEY,
  token_id        TEXT NOT NULL,
  ask_price_cents INTEGER,
  fmv_cents       INTEGER,
  observed_at     TEXT NOT NULL,
  snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id)
);
CREATE INDEX idx_lh_token_time ON listing_history(token_id, observed_at DESC);

-- homepage "Latest Activities" feed
CREATE TABLE sales (
  id              INTEGER PRIMARY KEY,
  activity_id     TEXT NOT NULL UNIQUE,        -- tx-hash id; DOM-fallback rows get 'synth:' + sha256
  token_id        TEXT,
  card_title      TEXT NOT NULL,
  set_name        TEXT,
  grade           TEXT,
  grading_company TEXT,
  price_cents     INTEGER NOT NULL,
  pct_change      REAL,
  sold_at         TEXT,                        -- NULL when the feed only gives relative time
  observed_at     TEXT NOT NULL,
  source          TEXT NOT NULL,               -- 'site:home-activities:flight' | 'site:home-activities:dom'
  snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id)
);
-- expression index matching recentSales' ORDER BY exactly (sold_at is NULL
-- for DOM-fallback rows, so the sort key is the coalesced timestamp)
CREATE INDEX idx_sales_time ON sales(COALESCE(sold_at, observed_at) DESC);

-- per-source freshness: THE read path for the UI's "data as of" banner
CREATE TABLE source_status (
  source               TEXT PRIMARY KEY,
  last_attempt_at      TEXT NOT NULL,
  last_success_at      TEXT,
  last_status          TEXT NOT NULL,          -- 'ok' | 'failed' | 'quarantined'
  last_error           TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  latest_snapshot_id   INTEGER REFERENCES snapshots(id)
);

-- reserved for Milestone 2 (created now to avoid migration churn)
CREATE TABLE ev_runs (
  id                 INTEGER PRIMARY KEY,
  pack_slug          TEXT NOT NULL REFERENCES packs(slug),
  p10_cents          INTEGER,
  p50_cents          INTEGER,
  p90_cents          INTEGER,
  params_json        TEXT NOT NULL,
  assumptions_json   TEXT NOT NULL,            -- [{name, value, source, confidence}]
  input_snapshot_ids TEXT,                     -- JSON array: provenance chain for every EV number
  ran_at             TEXT NOT NULL
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
