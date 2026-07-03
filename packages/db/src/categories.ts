import type { SaleRow } from './types'

/**
 * Sales rows carry no structured category (set_name is always NULL in the
 * feed), so category is parsed from the card title. Rules are deliberately
 * substring-simple and case-insensitive; anything unrecognized degrades to
 * 'other'/'en' rather than guessing.
 */
export type Franchise = 'pokemon' | 'one-piece' | 'other'
export type CardLanguage = 'ja' | 'zh-Hans' | 'en'

export interface SaleCategory {
  franchise: Franchise
  language: CardLanguage
  /** stable grouping key, `${franchise}/${language}` */
  key: string
  /** display label, e.g. 'Pokémon · JP' */
  label: string
}

const FRANCHISE_LABEL: Record<Franchise, string> = {
  pokemon: 'Pokémon',
  'one-piece': 'One Piece',
  other: 'Other',
}

const LANGUAGE_LABEL: Record<CardLanguage, string> = {
  ja: 'JP',
  'zh-Hans': 'CN',
  en: 'EN',
}

export function categorizeSaleTitle(cardTitle: string): SaleCategory {
  const t = cardTitle.toLowerCase()
  const franchise: Franchise = t.includes('pokemon')
    ? 'pokemon'
    : t.includes('pokémon')
      ? 'pokemon'
      : t.includes('one piece')
        ? 'one-piece'
        : 'other'
  // 'simplified chinese' MUST be checked before 'japanese' — both are title
  // tokens, but a title never carries both; the specific token wins anyway.
  const language: CardLanguage = t.includes('simplified chinese')
    ? 'zh-Hans'
    : t.includes('japanese')
      ? 'ja'
      : 'en'
  return {
    franchise,
    language,
    key: `${franchise}/${language}`,
    label: `${FRANCHISE_LABEL[franchise]} · ${LANGUAGE_LABEL[language]}`,
  }
}

export interface CategorySalesStats {
  key: string
  label: string
  n: number
  medianPriceCents: number
  minPriceCents: number
  maxPriceCents: number
  /** max COALESCE(sold_at, observed_at) within the group */
  latestAt: string | null
}

/** Pure aggregation over already-fetched sales rows — category rules live in ONE place. */
export function categorySalesStats(sales: SaleRow[]): CategorySalesStats[] {
  const groups = new Map<string, { label: string; prices: number[]; latestAt: string | null }>()
  for (const sale of sales) {
    const category = categorizeSaleTitle(sale.card_title)
    const at = sale.sold_at ?? sale.observed_at
    const group = groups.get(category.key)
    if (group === undefined) {
      groups.set(category.key, { label: category.label, prices: [sale.price_cents], latestAt: at })
    } else {
      group.prices.push(sale.price_cents)
      if (group.latestAt === null || (at !== null && at > group.latestAt)) group.latestAt = at
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const sorted = [...g.prices].sort((a, b) => a - b)
      return {
        key,
        label: g.label,
        n: sorted.length,
        medianPriceCents: median(sorted),
        minPriceCents: sorted[0] ?? 0,
        maxPriceCents: sorted[sorted.length - 1] ?? 0,
        latestAt: g.latestAt,
      }
    })
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
}

/** Median of an ascending-sorted array; even counts average the two middles (mirrors medianAskToFmvRatio). */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  const hi = sorted[mid]
  if (hi === undefined) return 0
  const lo = sorted[mid - 1]
  return sorted.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2
}
