# RenaissLens

> Pack expected-value & market intelligence for [renaiss.xyz](https://www.renaiss.xyz) — know what a pack is worth before you rip it.

**Estimates from public data. Not financial advice. Not affiliated with Renaiss.**

## Quickstart

```bash
pnpm i && pnpm dev
```

No env vars needed — the dashboard boots offline from committed sample snapshots in `data/snapshots/demo/`. Live data ingestion is opt-in via `pnpm scrape`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Migrate DB → load demo snapshots → start the dashboard |
| `pnpm scrape` | One polite live ingestion cycle (Renaiss public API + homepage feed) |
| `pnpm scrape:mock` | Load committed demo snapshots into the DB — zero network |
| `pnpm scrape:watch` | Continuous ingestion loop (packs/feed ~30min, marketplace ~6h) |
| `pnpm test` | Unit tests (money conversion, parsers, loaders, RNG determinism) |
| `pnpm lint` / `pnpm typecheck` | Biome + `tsc --noEmit` |
| `pnpm db:migrate` / `pnpm db:reset` | Apply migrations / wipe + rebuild from demo snapshots |

## Screenshots

_(coming with Milestone 4 — dashboard polish)_

## Demo video

_(link placeholder — recorded before submission)_

## Data sources

| Source | What | Method | Cadence | Politeness |
|---|---|---|---|---|
| `api.renaiss.xyz` (public, no auth) | Packs, pack pull feed, marketplace listings | REST poll | 30 min / 6 h | ≥2s between requests, identified UA, backoff |
| `www.renaiss.xyz` homepage | "Latest Activities" sales feed | Server-rendered HTML fetch (Playwright fallback) | 30 min | Single page per cycle, identified UA |
| Renaiss Index API (`api.renaissos.com`) | External reference prices | _planned — not yet integrated_ | — | keyed, rate-limited |

Every stored record traces back to a raw snapshot on disk with a timestamp; every displayed metric carries its source and scrape time. See [METHODOLOGY.md](METHODOLOGY.md).

## Architecture

```
packages/scraper ──▶ SQLite (packages/db) ──▶ apps/web (Next.js dashboard)
                          ▲
packages/ev-engine ───────┘  (pure TS Monte Carlo, seeded RNG, zero runtime deps)
data/snapshots/           raw + parsed snapshot store (demo set committed)
```

## Safety & disclaimers

- **Not financial advice.** EV figures are estimates shown as ranges with labeled assumptions (see [METHODOLOGY.md](METHODOLOGY.md)).
- **No wallet code, no private keys, no transaction signing.** This repo reads public data only; the API client is structurally incapable of calling write endpoints.
- **No accounts, no cookies, no tracking.**
- **No secrets required.** Every env var is optional (see [.env.example](.env.example)); vars are read from the shell environment — no `.env` loader is bundled.
- **Polite scraping:** identified `RenaissLens-Hackathon/1.0` User-Agent, one global serial request queue with ≥2s spacing, capped exponential backoff honoring `Retry-After`, ~9 requests per cycle on explicit cadences, and a byte-exact snapshot store so development replays committed data instead of re-fetching.

## License

MIT
