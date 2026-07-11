# Submission — RenaissLens

## Project

RenaissLens — Renaiss Tech Hackathon S1, Tool track. Solo build, Jul 4–11 2026.

## One-line pitch

RenaissLens answers the one question every Renaiss gacha player has before ripping a pack — _is this +EV or am I donating?_ — honestly, from public data, with every assumption labeled.

## Demo video

**<https://youtu.be/FGXSA1rTzK0>** (2:22)

## Live URL

**<https://renaisslens-production.up.railway.app>**

- Repo: <https://github.com/OoJae/renaisslens>
- Health/status: <https://renaisslens-production.up.railway.app/api/health>

## Judging criteria mapping

### Usability

- **Clickable during judging**: the live URL above stays up through Jul 15 (uptime canary in `.github/workflows/uptime.yml` alerts on any non-200 every 15 minutes).
- **Data refreshes itself**: a background watch loop polls Renaiss's public API (~30 min) and marketplace (~6 h); every metric shows its source and scrape time.
- **One-command local run**: `pnpm i && pnpm dev` boots the full dashboard offline from committed demo snapshots — no keys, no env vars, no network.

### Safety

- EV is **always a range** (P10–P90 across resampled odds), never a single point; the P50 is labeled as a median, not a promise.
- Every model parameter is persisted and displayed as `observed` / `inferred` / `assumed` — the assumptions panel is on every pack page.
- Below 20 observed pulls the verdict is **"insufficient data"** — the tool refuses to fabricate a number.
- The AI explainer only sees numbers already on the page, must cite them inline, refuses buy/sell advice, and the server appends the not-financial-advice caveat regardless of what the model outputs.
- No wallets, no auth, no cookies, no tracking. The API client is structurally incapable of calling write endpoints.
- Polite scraping: identified `RenaissLens-Hackathon/1.0` UA, one serial request queue with ≥2s spacing, capped backoff honoring `Retry-After`, ~9 requests per cycle.

### Ecosystem relevance

- Built entirely on Renaiss's own public surfaces: `api.renaiss.xyz` (packs, pull feed, marketplace) and the homepage sales feed.
- The **Fairness tab** does the honest half now and reserves the rest: a live **observed-outcomes observatory** (per-tier empirical pull frequencies with Wilson confidence intervals + a claimed-EV-vs-observed reconciliation) sits above a deliberately-disabled **cryptographic pull-verification** roadmap section — which activates the day Renaiss open-sources its commitment scheme. It observes what it can, verifies nothing it can't.
- Marketplace "listing anomaly" radar surfaces mispriced listings *in both directions* — useful to buyers and to Renaiss's own market health.

### Clarity

- One question, one verdict per pack: **+EV likely / uncertain / −EV likely / insufficient data**, with the reasoning (scenarios, histogram, sensitivity ladder) one scroll below.
- An in-app [Methodology page](https://renaisslens-production.up.railway.app/methodology) explains every estimate in plain language; its Limitations section is deliberately the longest part.

### Innovation

- **Uncertainty-quantified Monte Carlo**: a two-layer simulation (outer layer resamples the odds themselves via Dirichlet + bootstrap; inner layer simulates pulls) so the displayed range covers *model uncertainty*, not just pull variance.
- **Five labeled scenarios** (as-observed / generous / neutral / house-favored / reference-prior) form a sensitivity ladder — the verdict requires agreement across scenarios, not one cherry-picked run.
- **Empirical pull accumulation**: the tool gets more confident as the public pull feed grows, and says so.
- Seeded RNG makes every published number reproducible from the same data state.

## Data sources, assumptions & limitations

See [METHODOLOGY.md](METHODOLOGY.md) — the Limitations section is deliberately the longest part of this project.

## Build log (by milestone)

- **M1 — Foundation**: pnpm monorepo (strict TS, biome, vitest, CI); SQLite schema + migration runner; polite scraper for packs / pull feed / marketplace / homepage sales with a byte-exact snapshot store and quarantine for unparseable payloads; committed demo snapshot set so the repo runs offline; app shell with the disclaimer banner.
- **M2 — EV engine**: pure-TS seeded Monte Carlo (zero runtime deps); two-layer uncertainty model; five scenarios; verdict rule with the insufficient-data refusal; `ev_runs` persistence + reproducibility tests; EV ranges and verdict badges on the dashboard.
- **M3 — Dashboard + market intel**: pack detail pages (animated histogram, sensitivity table, assumptions panel), market page (sales pulse, categorized feed, two-sided listing-anomaly radar), and the graded-slab design system (reduced-motion + mobile + keyboard-focus support throughout).
- **M4 — AI explainer + methodology**: guardrailed explain endpoint (provider-agnostic Anthropic protocol; server-enforced caveat; data-state-keyed cache; rate limiting), in-app Methodology page, fairness roadmap tab.
- **M5 — Ship**: Railway deploy (Docker multi-stage, volume-seeded demo data, health-gated boot, watch-loop supervisor with hourly snapshot pruning), public GitHub repo, uptime canary, submission assets.
- **M6 — The roadmap, shipped honestly**: (1) the Fairness tab became a live **observed-outcomes observatory** (per-tier empirical pull frequencies with Wilson confidence intervals + a claimed-EV-vs-observed reconciliation) above the still-disabled cryptographic-verification roadmap; (2) a **confidence-over-time** chart on each pack page (the EV range narrowing as pulls accumulate); (3) **Renaiss OS Index cross-pricing** integrated — an independent reference price cross-checked against Renaiss's own FMV on the market page, exact-matched by card identity and attributed.

## What's next

- **Fairness verification**: the moment Renaiss open-sources their provably-fair commitment scheme, the disabled section of the Fairness tab verifies pulls cryptographically (the observed-outcome data collection already runs).
- **Index-informed FMV in EV**: the market page cross-references the Index against FMV today; a natural next step is a *separately-reviewed* option to let a confident Index price inform the EV model's FMV haircut (kept labeled, never silently blended).
- **Broader Index coverage**: match pack pull cards (not just marketplace listings) to the Index, and use graded-cert lookups where certs become available.
