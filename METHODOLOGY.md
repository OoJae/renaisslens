# Methodology

_This document mirrors the in-app Methodology page. It is the single source of truth for how RenaissLens collects data, what it assumes, and what it cannot know._

## Data sources & collection

- **Renaiss public API (`api.renaiss.xyz`)** — no auth, no key; the same API the official `npx renaiss` CLI wraps. We call read-only endpoints: `/v0/packs`, `/v0/packs/{slug}`, `/v0/marketplace`. Our client exposes only GET wrappers; write endpoints are unreachable by construction.
- **`www.renaiss.xyz` homepage** — the "Latest Activities" sales feed is not exposed by the API, so we parse it from the server-rendered page (with a Playwright DOM fallback, whose rows are flagged lower-confidence).
- **Renaiss Index API (`api.renaissos.com`)** — _planned_ external reference prices (cross-marketplace sales). Not yet integrated; until then all FMV figures are Renaiss's own valuations.

Politeness: identified User-Agent `RenaissLens-Hackathon/1.0`, a single serial request queue with ≥2s spacing across all collectors, jittered exponential backoff honoring `Retry-After`, ~9 requests per cycle. The API publishes no rate limits; these constraints are self-imposed.

## Snapshot policy

Every fetch is stored as a snapshot — the byte-exact raw response, parsed output, and metadata (URL, timestamp, SHA-256) — before anything touches the database. Every database row references its snapshot. A curated demo set is committed so the app runs fully offline; when it does, the UI says so.

## Units & conversions (inferred convention)

Fields named `*InUSDT` are 18-decimal wei strings of USDT dollars; fields named `*InUSD` are integer cent strings. This convention is **inferred** from field naming plus live values verified on 2026-07-03 (e.g. `priceInUsdt: "48000000000000000000"` = $48 for a pack displayed at $48) — Renaiss does not document it. All conversion is exact BigInt arithmetic; wei→cents rounds half-up (sub-cent ask prices exist on the marketplace and are disclosed as rounded).

## Known limitations (read this before trusting any number)

1. **`recentOpenedPacks` completeness is unknown.** Renaiss does not document whether the pull feed is complete, sampled, or curated. We measure inter-poll overlap and report it; if consecutive polls share no entries, the window likely overflowed and pulls were missed.
2. **`expectedValueInUsd` is Renaiss's own claim**, not our estimate. It is always labeled "Renaiss claims" and tracked over time; it is never blended into our EV computation without labeling.
3. **Marketplace coverage is a sample** — the most recent listings pages per cycle, not the full book. A listing's absence from our data does not mean it was delisted.
4. **FMV is Renaiss's own valuation.** Independent cross-referencing awaits the Index API integration.
5. **The homepage activities feed may itself be truncated or curated.** When the primary (flight-payload) extraction breaks, a Playwright DOM fallback takes over: its rows have no on-chain id, use synthetic content-based dedupe keys (title + price), and may therefore under-count genuine repeat sales — they are flagged lower-confidence in the data.
6. **Pull-feed tier names are pack-specific and change without notice** (observed vocabularies: `TOP/S/A/B/C/D`, `legendary…common`, and Eden's themed `thorn/bloom` which appeared mid-build). Tier labels are stored verbatim; cross-pack comparisons use observed FMV, never tier names.
7. **We do not know true pack odds or pool composition.** The EV engine (Milestone 2) models under uncertainty and reports ranges with per-assumption confidence labels (`observed / inferred / assumed`) — never a single point estimate.

## EV model & labeled assumptions

_(Milestone 2 — mixture distributions anchored on observed pulls, pack price, featured-card FMV, and marketplace FMV distribution; sensitivity across pool-assumption scenarios.)_

## Monte Carlo approach

_(Milestone 2 — 100k simulated pulls per scenario; P10/P50/P90; P(pull ≥ pack price); P(top prize).)_

## Seeded RNG & reproducibility

All simulation uses a seeded PRNG (mulberry32). Given the same inputs and seed, every published EV range is exactly reproducible.

## Politeness & safety practices

No wallet code, no auth, no accounts, no cookies, no tracking. Read-only public data. Estimates always shown as ranges with source tags and scrape timestamps. Not affiliated with Renaiss.
