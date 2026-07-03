import { describe, expect, it } from 'vitest'
import type { SaleRow } from '../src/index'
import { categorizeSaleTitle, categorySalesStats } from '../src/index'

describe('categorizeSaleTitle', () => {
  it('parses real Japanese Pokémon titles', () => {
    expect(
      categorizeSaleTitle(
        'PSA 10 Gem Mint 2021 Pokemon Japanese Sword & Shield Vmax Climax #245 Umbreon Vmax',
      ),
    ).toEqual({ franchise: 'pokemon', language: 'ja', key: 'pokemon/ja', label: 'Pokémon · JP' })
  })

  it('defaults to EN when no language token appears', () => {
    expect(
      categorizeSaleTitle(
        'PSA 10 Gem Mint 2019 Pokemon Sun & Moon Unbroken Bonds #120 Lucario & Melmetal Gx',
      ).language,
    ).toBe('en')
  })

  it('is not confused by set names containing "En-"', () => {
    const c = categorizeSaleTitle("PSA 10 Gem Mint 2025 Pokemon Blk En-Black Bolt #170 N's Plan")
    expect(c).toMatchObject({ franchise: 'pokemon', language: 'en' })
  })

  it('checks Simplified Chinese before Japanese', () => {
    const c = categorizeSaleTitle(
      "PSA 10 Gem Mint 2023 Pokemon Simplified Chinese Csm2b C-Shining Synergy #069 Lillie's Full Force",
    )
    expect(c.language).toBe('zh-Hans')
    expect(c.label).toBe('Pokémon · CN')
  })

  it('recognizes One Piece in both languages (future-proofing)', () => {
    expect(
      categorizeSaleTitle(
        'PSA 10 Gem Mint 2023 One Piece Japanese OP-05 Awakening of the New Era #119 Monkey D. Luffy',
      ),
    ).toMatchObject({ franchise: 'one-piece', language: 'ja', label: 'One Piece · JP' })
    expect(
      categorizeSaleTitle('PSA 9 Mint 2023 One Piece OP-01 Romance Dawn #001 Roronoa Zoro'),
    ).toMatchObject({ franchise: 'one-piece', language: 'en' })
  })

  it('degrades unknown and empty titles to other/en', () => {
    expect(categorizeSaleTitle('CGC 9 2019 Dragon Ball Super Ultimate Box #SS4')).toMatchObject({
      franchise: 'other',
      language: 'en',
    })
    expect(categorizeSaleTitle('')).toMatchObject({ franchise: 'other', language: 'en' })
  })

  it('is case-insensitive', () => {
    expect(categorizeSaleTitle('POKEMON JAPANESE PROMO #001 PIKACHU').key).toBe('pokemon/ja')
  })
})

describe('categorySalesStats', () => {
  const sale = (over: Partial<SaleRow>): SaleRow => ({
    id: 1,
    activity_id: 'a',
    token_id: null,
    card_title: 'PSA 10 Gem Mint 2021 Pokemon Japanese Promo #1 Pikachu',
    set_name: null,
    grade: '10',
    grading_company: 'PSA',
    price_cents: 10_000,
    pct_change: null,
    sold_at: '2026-07-03T10:00:00.000Z',
    observed_at: '2026-07-03T11:00:00.000Z',
    source: 'test',
    snapshot_id: 1,
    ...over,
  })

  it('groups by category, computes medians (even count averages middles), sorts n DESC', () => {
    const stats = categorySalesStats([
      sale({ price_cents: 1000 }),
      sale({ price_cents: 3000, sold_at: '2026-07-03T10:30:00.000Z' }),
      sale({ price_cents: 9000 }),
      sale({ price_cents: 5000 }),
      sale({ card_title: 'PSA 10 2019 Pokemon Sun & Moon #1 Eevee', price_cents: 2000 }),
    ])
    expect(stats.map((s) => s.key)).toEqual(['pokemon/ja', 'pokemon/en'])
    const jp = stats[0]
    if (jp === undefined) throw new Error('expected JP stats')
    expect(jp.n).toBe(4)
    expect(jp.medianPriceCents).toBe((3000 + 5000) / 2) // even count → average of middles
    expect(jp.minPriceCents).toBe(1000)
    expect(jp.maxPriceCents).toBe(9000)
    expect(jp.latestAt).toBe('2026-07-03T10:30:00.000Z')
    expect(stats[1]?.medianPriceCents).toBe(2000) // odd count → middle
  })

  it('falls back to observed_at when sold_at is NULL', () => {
    const stats = categorySalesStats([
      sale({ sold_at: null, observed_at: '2026-07-03T12:00:00.000Z' }),
    ])
    expect(stats[0]?.latestAt).toBe('2026-07-03T12:00:00.000Z')
  })

  it('returns [] for no sales', () => {
    expect(categorySalesStats([])).toEqual([])
  })
})
