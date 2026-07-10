-- Renaiss OS Index cross-pricing (api.renaissos.com). Independent reference
-- prices, cross-referenced against Renaiss's own FMV. All figures are the
-- Index's own valuations; `href` links the public source page (also the
-- required attribution). Not FK'd to a snapshot: this is an external index,
-- not the scraped platform — provenance is `observed_at` + `href` + confidence.

-- One reference price per card identity. `match_key` is a normalized
-- company|grade|set|number tuple (indexMatchKey), so listings join to it in TS.
CREATE TABLE index_prices (
  match_key       TEXT PRIMARY KEY,
  game            TEXT,
  name            TEXT,
  set_name        TEXT,
  card_number     TEXT,
  grading_company TEXT,
  grade           TEXT,
  price_cents     INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  confidence      TEXT,                       -- Index confidence tier: high/medium/low
  delta_pct       REAL,
  last_sale_at    TEXT,
  href            TEXT,                        -- Renaiss OS Index source page (attribution)
  observed_at     TEXT NOT NULL
);

-- Display-only market context (index values + recent trades), latest-per-kind.
CREATE TABLE index_market (
  kind         TEXT PRIMARY KEY,              -- 'indices' | 'recent_trades'
  payload_json TEXT NOT NULL,
  observed_at  TEXT NOT NULL
);
