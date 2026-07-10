import { z } from 'zod'

/**
 * Renaiss OS Index (api.renaissos.com) wire schemas — authored against REAL
 * captured responses, not guesses. `.passthrough()` tolerates additive drift;
 * required fields fail hard so a shape change is caught, not silently mis-stored.
 * Prices arrive as integer USD cents (`priceUsdCents`), unlike the main API's
 * wei/cents strings.
 */

/** A priced card — shared by /v1/search results, /v1/cards/featured, /v1/graded card. */
export const IndexCardSchema = z
  .object({
    game: z.string().nullish(),
    name: z.string().nullish(),
    setName: z.string().nullish(),
    setCode: z.string().nullish(),
    cardNumber: z.string().nullish(),
    variation: z.string().nullish(),
    language: z.string().nullish(),
    company: z.string().nullish(),
    grade: z.string().nullish(),
    gradeLabel: z.string().nullish(),
    priceUsdCents: z.number().nullish(),
    deltaPct: z.number().nullish(),
    confidence: z.string().nullish(),
    lastSaleAt: z.string().nullish(),
    href: z.string().nullish(),
  })
  .passthrough()
export type IndexCard = z.infer<typeof IndexCardSchema>

export const SearchResponseSchema = z
  .object({ query: z.string().nullish(), results: z.array(IndexCardSchema) })
  .passthrough()

export const IndexEntrySchema = z
  .object({
    game: z.string(),
    label: z.string(),
    value: z.number(),
    base: z.number().nullish(),
    deltas: z
      .object({ d7: z.number().nullish(), d30: z.number().nullish(), d365: z.number().nullish() })
      .passthrough()
      .nullish(),
    constituentCount: z.number().nullish(),
    rebalance: z.string().nullish(),
  })
  .passthrough()
export const IndicesResponseSchema = z.object({ indices: z.array(IndexEntrySchema) }).passthrough()

export const TradeSchema = z
  .object({
    id: z.string().nullish(),
    observedAt: z.string().nullish(),
    priceUsdCents: z.number().nullish(),
    currency: z.string().nullish(),
    company: z.string().nullish(),
    gradeLabel: z.string().nullish(),
    card: z
      .object({
        game: z.string().nullish(),
        name: z.string().nullish(),
        setCode: z.string().nullish(),
        cardNumber: z.string().nullish(),
        href: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
export const TradesResponseSchema = z.object({ trades: z.array(TradeSchema) }).passthrough()

// ── parse helpers (throw ZodError on shape violation → quarantine upstream) ──

export function parseSearchResults(rawText: string): IndexCard[] {
  return SearchResponseSchema.parse(JSON.parse(rawText)).results
}

/** Trimmed index-values payload for the display-only panel. */
export function parseIndices(rawText: string): {
  game: string
  label: string
  value: number
  d7: number | null
  d30: number | null
  constituentCount: number | null
}[] {
  return IndicesResponseSchema.parse(JSON.parse(rawText)).indices.map((i) => ({
    game: i.game,
    label: i.label,
    value: i.value,
    d7: i.deltas?.d7 ?? null,
    d30: i.deltas?.d30 ?? null,
    constituentCount: i.constituentCount ?? null,
  }))
}

/** Trimmed recent-trades payload for the panel (only priced, card-identified rows). */
export function parseRecentTrades(rawText: string): {
  name: string
  game: string | null
  gradeLabel: string | null
  priceUsdCents: number
  observedAt: string | null
  href: string | null
}[] {
  return TradesResponseSchema.parse(JSON.parse(rawText))
    .trades.filter((t) => typeof t.priceUsdCents === 'number' && t.card?.name)
    .map((t) => ({
      name: t.card?.name ?? '',
      game: t.card?.game ?? null,
      gradeLabel: t.gradeLabel ?? null,
      priceUsdCents: t.priceUsdCents as number,
      observedAt: t.observedAt ?? null,
      href: t.card?.href ?? null,
    }))
}
