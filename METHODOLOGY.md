# Methodology

_This document is the single source of truth for how RenaissLens collects data, what it assumes, and what it cannot know. It is mirrored in the app at `/methodology`._

## Data sources & collection

- **Renaiss public API (`api.renaiss.xyz`)** — no auth, no key; the same API the official `npx renaiss` CLI wraps. We call read-only endpoints: `/v0/packs`, `/v0/packs/{slug}`, `/v0/marketplace`. Our client exposes only GET wrappers; write endpoints are unreachable by construction.
- **`www.renaiss.xyz` homepage** — the "Latest Activities" sales feed is not exposed by the API, so we parse it from the server-rendered page (with a Playwright DOM fallback, whose rows are flagged lower-confidence).
- **Renaiss Index API (`api.renaissos.com`)** — _planned_ external reference prices (cross-marketplace sales). Not yet integrated; until then all FMV figures are Renaiss's own valuations. The dormant scaffolding and the exact activation contract live in [`docs/index-api-activation.md`](docs/index-api-activation.md).

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

We do not know Renaiss's true odds or pool composition, so the engine models the odds themselves as uncertain instead of pretending to know them.

**Pool model (per pack).** Observed pulls are grouped by their verbatim tier label into a mixture. Tier probabilities get a Dirichlet posterior over the observed counts (Jeffreys-style pseudo-count 0.5, so small samples widen the range rather than sharpen it); tier values are bootstrap-resampled from the observed FMVs. The advertised top prize is deliberately **not** a tier: no observed pull has ever reached it, so its probability is an explicit **assumption** — a log-uniform odds band, never an inference. The middle of the distribution is observed; the tail is assumed and labeled. Marketplace listings do **not** enter the pool model; they contribute one inferred context stat (median ask/FMV) that motivates — but does not determine — the FMV haircut.

**Scenarios.** Every run sweeps five named scenarios, each nothing but a list of labeled assumptions (the engine reads its parameters back out of that list, so the assumptions panel always shows exactly what ran):

| scenario | feed-bias ÷ | FMV haircut | top-prize odds band | role |
|---|---|---|---|---|
| `as-observed` | 1 | 1.00 | off | pull feed at face value — likely too rosy; display only |
| `generous` | 1 | 1.00 | 1/1000 – 1/500 | feed complete and unbiased, FMV fully realizable |
| `neutral` | 2 | 0.90 | 1/3000 – 1/1000 | **headline scenario** |
| `house-favored` | 5 | 0.80 | 1/10000 – 1/3000 | feed curated toward hits; consistent with the 10–40% reference-class hold band |
| `reference-prior` | — | — | — | ignores our data entirely: EV = price × (1 − hold), hold ~ U(0.10, 0.40); contrast only |

The feed-bias factor divides the observed counts of "hit" tiers (mean FMV ≥ 1.5× pack price) before the posterior is built — it models the possibility that limitation #1's feed curation over-shows big pulls. The haircut discounts Renaiss-assigned FMV toward realizable value (limitation #4).

**Verdict rule.** With fewer than 20 observed pulls, the verdict is `insufficient data` and no range is published at all. Otherwise: `+EV likely` requires P(EV > price) ≥ 80% under `neutral` **and** ≥ 50% under `house-favored`; `−EV likely` requires P(EV > price) ≤ 20% under `neutral` **and** ≤ 50% under `generous`; anything in between is `uncertain`. The badge never reads +/−EV unless the skeptical scenario agrees.

**Known degeneracy:** a tier observed only once bootstraps to a constant; its uncertainty is carried by the Dirichlet weight, not the value spread. This is disclosed rather than patched.

## Monte Carlo approach

100,000 iterations per scenario, two layers per iteration:

1. **Parameter layer** — redraw tier weights (Dirichlet), tier means (bootstrap), and top-prize probability (log-uniform band), then compute that draw's exact EV. **P10/P50/P90 are percentiles of this EV distribution** — a credible range for the pack's expected payout, not single-pull luck — and P(EV > price) from the same samples drives the verdict.
2. **Pull layer** — simulate one pull from the same parameter draw, giving P(pull ≥ pack price), P(top prize), and the pull-value histogram.

The `reference-prior` contrast scenario is single-layer by design: it applies a house-edge band to the pack price and models no individual pull, so its P(break even) and P(top prize) are stored as `null` (not modeled) rather than a fabricated `0`, and its histogram shows the EV spread rather than pull values.

Every run persists to `ev_runs` with its full scenario parameters, assumption list, and `input_snapshot_ids` — the exact raw snapshots that fed the model — so every published range traces back to bytes on disk. Seeds derive from `pack | scenario | input snapshot ids`: the same data state always publishes the identical range.

## Seeded RNG & reproducibility

All simulation uses a seeded PRNG (mulberry32). Given the same inputs and seed, every published EV range is exactly reproducible.

## Observed-outcomes fairness observatory

The `/fairness` tab shows what the public pull feed **actually paid out** — it does not, and cannot, verify that the draws are fair. True fairness verification needs Renaiss's commitment scheme (server-seed commitments and Merkle roots), which is not public; that half of the tab is shipped disabled as a roadmap item.

What the observatory computes from data already collected:

- **Per-tier empirical frequency with a 95% Wilson score interval.** For each pack tier, the observed share `k/n` and a closed-form Wilson interval. Wilson is preferred over a Jeffreys binomial interval because it needs no special functions and stays sensible at `k = 0`, `k = n`, and small `n`; it applies the same Jeffreys-0.5 skepticism the EV engine uses, but is **not** numerically identical to the engine's Dirichlet marginal (which spreads 0.5 across every tier).
- **Claimed-EV-vs-observed reconciliation.** Renaiss's single advertised EV beside the mean realized FMV of the observed pulls, with a seeded 95% bootstrap CI on that mean (bootstrap because pull FMVs are heavy-tailed). This is the only honest "claimed vs observed" comparison available — Renaiss publishes **no per-tier odds**, so there is no claimed distribution to run a goodness-of-fit test against.

Two honesty constraints are load-bearing here. First, both sides of the reconciliation rest on Renaiss's own FMV valuations (limitation #4), so it is an internal-consistency check, **not** an independent price check — that awaits the Index API. Second, every frequency is a frequency in the *observed* feed, whose completeness is unknown (limitation #1); a gap between observed and claimed is a flag for scrutiny, **never proof of unfairness**, because feed curation explains a gap equally well. Packs below the 20-pull EV threshold show no distribution at all.

## The AI explainer

The AI explainer is commentary on the estimates above — it is given only the numbers shown on the page, told which are assumptions, and instructed to refuse buy/sell advice. Its output always carries the same not-financial-advice caveat, enforced server-side rather than trusted to the model. It is optional: without an `ANTHROPIC_API_KEY`, the feature does not appear.

## Politeness & safety practices

No wallet code, no auth, no accounts, no cookies, no tracking. Read-only public data. Estimates always shown as ranges with source tags and scrape timestamps. Not affiliated with Renaiss.
