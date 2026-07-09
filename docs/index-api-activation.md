# Activating Renaiss Index API cross-pricing

The scaffolding is in place; the live integration is deliberately **not**, because
building a parser against a response we've never seen would violate the same
anti-fabrication rule the rest of RenaissLens follows (snapshot-and-quarantine,
label-don't-guess). This doc is the contract for finishing it honestly.

## What already exists (dormant, shipped)

- `RENAISS_INDEX_API_URL` (default `https://api.renaissos.com`) + `RENAISS_INDEX_API_KEY`
  in [`packages/scraper/src/config.ts`](../packages/scraper/src/config.ts), with a
  call-time gate `indexApiConfigured()` mirroring the AI explainer's key gate.
- A generic auth-header capability on `politeGet` (`opts.headers`) — the identified
  User-Agent can never be stripped. Covered by `packages/scraper/test/politeClient.test.ts`.
- A registered-but-dormant source `api-index` in
  [`packages/scraper/src/api/indexPricing.ts`](../packages/scraper/src/api/indexPricing.ts):
  it **benign-skips before any network call**, so a key set early neither fetches nor
  fabricates. `runCycle` excludes it from the "claim live mode" check, so the skip can't
  flip `data_mode`.
- A provisional `IndexCrossRef` output interface (OUR normalized target — not a guess of
  Renaiss's wire fields).
- A "planned / not configured" card on `/market` and the "planned" labels in
  `README.md` / `METHODOLOGY.md`.

## What YOU must provide to activate

1. `RENAISS_INDEX_API_KEY` (set it as a Railway variable + in `apps/web/.env.local` for local).
2. The **endpoint path(s)** under `api.renaissos.com` we should call (e.g. `/v1/prices?card=…`).
3. **One real sample response** (raw bytes) or the API docs / an OpenAPI URL.
4. The **auth scheme** — `Authorization: Bearer <key>` vs `x-api-key: <key>`.
5. Any documented **rate limits** (so the politeness settings can respect them).

## What gets filled in, in order (mostly one seam)

1. **Fetch + parse seam** — in `api/indexPricing.ts`, replace the keyed benign-skip with
   `politeGet(url, { source: INDEX_SOURCE, headers: { Authorization: … } })` + a
   `parseIndexResponse()` built **from the real sample**.
2. **Schema from real bytes** — add a Zod schema to `parsers/schemas.ts` + a normalizer to
   `parsers/normalize.ts`. Prefer generating the raw type
   (`openapi-typescript https://api.renaissos.com/openapi.json -o src/api/indexTypes.gen.ts`,
   mirroring the existing `codegen` script) so it's generated, not hand-guessed.
3. **Persistence** — a DB migration + loader for the reference prices, keyed by card identity
   (token id / set / card number / grade — already normalized elsewhere).
4. **Cadence** — add `'api-index'` to `CONFIG.cadences` (e.g. daily). Only now does `watch`
   poll it; the fetch seam must exist first.
5. **EV integration** — introduce the cross-reference as a NEW `inferred` assumption
   `index_cross_ref_ratio` in `scenarios.ts`, carried for contrast. Do **not** silently blend it
   into `fmvHaircut`; `simulate.ts`/`mixture.ts` stay untouched until a deliberate, separately
   reviewed change (METHODOLOGY.md limitation #4: label, don't overwrite).

## Do NOT do before you have the real response

- No Zod schema / normalizer / DB columns against a guessed payload.
- No `RawIndexResponse` hand-written — generate it.
- No EV blending of an imagined price.

Only when a real, validated number renders should the three "planned — not yet integrated"
labels (`README.md`, `METHODOLOGY.md`, this repo's market card) flip to "integrated."
