import type { NewListing, NewPack, NewPull, NewSale } from '@renaisslens/db'
import { extractActivities } from '../site/flight'
import { usdCentsToInt, weiUsdtToCents } from './money'
import type { Activity, MarketplaceItem, Pack, RecentPull } from './schemas'
import {
  ActivitiesSchema,
  MarketplaceResponseSchema,
  PackDetailResponseSchema,
  PacksResponseSchema,
} from './schemas'

export function normalizePack(p: Pack): NewPack {
  return {
    slug: p.slug,
    name: p.name,
    packType: p.packType,
    stage: p.stage,
    description: p.description ?? null,
    author: p.author ?? null,
    priceCents: weiUsdtToCents(p.priceInUsdt),
    expectedValueCents: p.expectedValueInUsd != null ? usdCentsToInt(p.expectedValueInUsd) : null,
    featuredCardFmvCents:
      p.featuredCardFmvInUsd != null ? usdCentsToInt(p.featuredCardFmvInUsd) : null,
  }
}

export function normalizePulls(packSlug: string, pulls: RecentPull[]): NewPull[] {
  return pulls.map((pull) => ({
    packSlug,
    collectibleTokenId: pull.collectibleTokenId,
    tier: pull.tier,
    fmvCents: usdCentsToInt(pull.fmv),
    pulledAt: pull.pulledAtTimestamp,
  }))
}

export function normalizeListing(item: MarketplaceItem): NewListing {
  const attributes = item.attributes ?? null
  const language = attributes?.find((a) => a.trait.toLowerCase() === 'language')?.value
  return {
    tokenId: item.tokenId,
    name: item.name,
    setName: item.setName ?? null,
    cardNumber: item.cardNumber != null ? String(item.cardNumber) : null,
    pokemonName: item.pokemonName ?? null,
    gradingCompany: item.gradingCompany ?? null,
    grade: item.grade != null ? String(item.grade) : null,
    year: item.year != null ? Number(item.year) : null,
    language: typeof language === 'string' ? language : null,
    vaultLocation: item.vaultLocation ?? null,
    ownerAddress: item.ownerAddress ?? null,
    ownerUsername: item.owner?.username ?? null,
    askPriceCents:
      item.askPriceInUSDT === 'NO-ASK-PRICE' ? null : weiUsdtToCents(item.askPriceInUSDT),
    askExpiresAt: item.askExpiresAt ?? null,
    fmvCents: item.fmvPriceInUSD === 'NO-FMV-PRICE' ? null : usdCentsToInt(item.fmvPriceInUSD),
    attributesJson: attributes != null ? JSON.stringify(attributes) : null,
  }
}

export class ActivitiesShapeError extends Error {
  constructor(
    message: string,
    readonly sample: unknown,
  ) {
    super(`ActivitiesShapeError: ${message}`)
    this.name = 'ActivitiesShapeError'
  }
}

const stripFlightBigInt = (s: string): string => s.slice(2) // "$n123" → "123"
const stripFlightDate = (s: string): string => s.slice(2) // "$D2026-…" → "2026-…"

/** BSC USDT — the only settlement token observed in the activities feed. */
const USDT_BSC = '0x55d398326f99059ff775485246999027b3197955'

/** "PSA 10 Gem Mint 2021 Pokemon … Umbreon Vmax" → { company: 'PSA', grade: '10' } */
export function gradeFromTitle(title: string): { company: string | null; grade: string | null } {
  const m = title.match(/^(PSA|BGS|CGC|SGC)\s+(10|[1-9](?:\.5)?)\b/i)
  if (!m || m[1] === undefined || m[2] === undefined) return { company: null, grade: null }
  return { company: m[1].toUpperCase(), grade: m[2] }
}

/**
 * Normalizer finalized against the live snapshot of 2026-07-03. Non-sale
 * actions and rows without a collectible are skipped (counted, not fatal);
 * if the essentials fail to resolve for most rows, we throw → quarantine.
 */
export function normalizeActivities(activities: Activity[]): NewSale[] {
  const sales: NewSale[] = []
  for (const a of activities) {
    if (a.action.toUpperCase() !== 'SELL') continue
    const title = a.collectible?.name
    if (title === undefined) continue
    // `value` is interpreted as USDT wei-18; skip rows settled in any other
    // token rather than mis-convert them
    const tokenAddress = (a as Record<string, unknown>).tokenAddress
    if (typeof tokenAddress === 'string' && tokenAddress.toLowerCase() !== USDT_BSC) continue
    const ts = a.timestamp ?? a.createdAt
    const tsIso = ts != null ? stripFlightDate(ts) : null
    const { company, grade } = gradeFromTitle(title)
    sales.push({
      activityId: a.id,
      tokenId: a.tokenId != null ? stripFlightBigInt(a.tokenId) : null,
      cardTitle: title,
      setName: null, // not present in the feed; card detail joins land later
      grade,
      gradingCompany: company,
      priceCents: weiUsdtToCents(stripFlightBigInt(a.value)),
      pctChange: a.priceChangePercentage ?? null,
      // an unparseable date must degrade to null, not crash past quarantine
      soldAt:
        tsIso !== null && !Number.isNaN(Date.parse(tsIso)) ? new Date(tsIso).toISOString() : null,
      source: 'site:home-activities:flight',
    })
  }
  if (activities.length > 0 && sales.length < activities.length / 2) {
    throw new ActivitiesShapeError(
      `resolved only ${sales.length}/${activities.length} activities — feed shape may have changed`,
      activities[0],
    )
  }
  return sales
}

// ── parse compositions: byte-exact raw → validated → normalized ──────────────
// Shared by the live cycle and the mock loader, so both modes exercise the
// IDENTICAL path. Throws ZodError / MoneyParseError / FlightParseError /
// ActivitiesShapeError — all of which the cycle runner maps to `quarantined`.

export function parsePacksResponse(rawText: string): NewPack[] {
  const parsed = PacksResponseSchema.parse(JSON.parse(rawText))
  return parsed.cardPacks.map(normalizePack)
}

export function parsePackDetailResponse(rawText: string): { pack: NewPack; pulls: NewPull[] } {
  const parsed = PackDetailResponseSchema.parse(JSON.parse(rawText))
  const pack = normalizePack(parsed.cardPack)
  const pulls = normalizePulls(pack.slug, parsed.cardPack.recentOpenedPacks ?? [])
  return { pack, pulls }
}

export function parseMarketplaceResponse(rawText: string): {
  listings: NewListing[]
  total: number
} {
  const parsed = MarketplaceResponseSchema.parse(JSON.parse(rawText))
  return { listings: parsed.collection.map(normalizeListing), total: parsed.pagination.total }
}

export function parseActivitiesHtml(html: string): NewSale[] {
  const raw = extractActivities(html)
  const activities = ActivitiesSchema.parse(raw)
  return normalizeActivities(activities)
}
