# Renaiss OS Index cross-pricing — ACTIVATED

**Status: live.** The dormant scaffolding described earlier has been filled in against
real `api.renaissos.com` responses. This doc is now the maintenance reference.

## What runs

- **Auth**: `X-Api-Key` + `X-Api-Secret` headers (partner key), read by `indexApiCredentials()`
  in [`config.ts`](../packages/scraper/src/config.ts), sent via `politeGet`'s `headers` option
  (identified UA preserved). Credentials live in `apps/web/.env.local` (gitignored) + Railway.
- **Collector** (`api-index`, daily): [`api/indexPricing.ts`](../packages/scraper/src/api/indexPricing.ts)
  fetches `/v1/indices` + `/v1/trades/recent` (display-only panel) and, for the richest ~40
  distinct graded listings, calls `/v1/search` and **exact-matches** each result on
  `company|grade|set|number` ([`matchCard.ts`](../packages/scraper/src/matchCard.ts) +
  [`indexMatchKey`](../packages/db/src/matchKey.ts)). Only exact matches are stored; the rest are
  skipped, never guessed. Self-skips (no network) when unkeyed.
- **Schemas** ([`parsers/indexSchemas.ts`](../packages/scraper/src/parsers/indexSchemas.ts)) were
  authored from real captured responses; `.passthrough()` tolerates additive drift, required
  fields fail hard.
- **Storage**: `index_prices` (keyed by the normalized match key) + `index_market` (panel), migration
  [`0003_index.sql`](../packages/db/migrations/0003_index.sql). Not FK'd to a snapshot — provenance
  is `observed_at` + each row's `href` (the Index source page, which is also the required attribution).
- **UI**: `/market` shows the independent **Renaiss OS Index** panel and an **Index** cross-reference
  line inside the anomaly radar (Index price + % vs FMV + confidence), attributed to Renaiss OS Index.
- **EV is untouched**: the Index is displayed for contrast only, never blended into the EV model
  (METHODOLOGY.md limitation #4 — label, don't overwrite).

## Facts about the API (for reference)

- Base `https://api.renaissos.com`; OpenAPI at `/v1/openapi.json`.
- Our marketplace listings carry **no cert numbers**, so `/v1/graded/{cert}` isn't used for them;
  structural `/v1/search` + exact-match is the path. `/v1/graded/{cert}` remains available for any
  future cert-bearing data.
- The docs page's `/v1/index/item-by-no` / `/v1/index/by-cert` are **not** on the host (they 404 to
  the site HTML); the OpenAPI spec is authoritative.
- Partner quota 10k/day; per-IP public tier 10/day. Attribution ("Renaiss OS Index" + link) required.

## Extending later

- Match pack **pull** cards (not just listings) to the Index.
- A separately-reviewed option to let a high-confidence Index price inform the EV `fmvHaircut`
  (kept labeled as `inferred`, never silently blended).
