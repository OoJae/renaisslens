import { describe, expect, it } from 'vitest'
import { parseIndices, parseRecentTrades, parseSearchResults } from '../src/parsers/indexSchemas'

// fixtures trimmed from REAL api.renaissos.com responses
const SEARCH = JSON.stringify({
  query: 'Charizard',
  results: [
    {
      game: 'pokemon',
      name: 'Charizard Ex',
      setName: 'Pokemon Svp En-Sv Black Star Promo',
      cardNumber: '161',
      company: 'PSA',
      grade: '10 Gem Mint',
      gradeLabel: 'PSA 10',
      priceUsdCents: 5402,
      deltaPct: -6.78,
      confidence: 'high',
      lastSaleAt: '2026-07-05T08:00:00.000Z',
      href: '/card/pokemon/...',
    },
  ],
})

const INDICES = JSON.stringify({
  indices: [
    {
      game: 'pokemon',
      label: 'Pokémon · Index',
      value: 12343.14,
      base: 10000,
      deltas: { d7: -1.25, d30: -18.07, d365: 57.63 },
      constituentCount: 50,
      rebalance: 'Monthly',
      sparkline: [{ t: '2026-06-10T00:00:00.000Z', usdCents: 1488331 }],
    },
  ],
})

const TRADES = JSON.stringify({
  trades: [
    {
      id: 'x',
      observedAt: '2026-07-10T10:00:00.000Z',
      priceUsdCents: 70794,
      currency: 'JPY',
      company: 'PSA',
      gradeLabel: 'PSA 10',
      card: { game: 'one-piece', name: 'Monkey.D.Luffy', cardNumber: '055', href: '/card/...' },
    },
    { id: 'y', priceUsdCents: null, card: null }, // dropped: no price / no card
    { id: 'z', priceUsdCents: 0, card: { name: 'Zero Priced' } }, // dropped: non-positive price
  ],
})

describe('index schemas', () => {
  it('parses search results with the reference price', () => {
    const r = parseSearchResults(SEARCH)
    expect(r).toHaveLength(1)
    expect(r[0]?.priceUsdCents).toBe(5402)
    expect(r[0]?.cardNumber).toBe('161')
  })

  it('trims indices to the panel shape', () => {
    const idx = parseIndices(INDICES)
    expect(idx[0]?.label).toBe('Pokémon · Index')
    expect(idx[0]?.value).toBe(12343.14)
    expect(idx[0]?.d7).toBe(-1.25)
  })

  it('keeps only priced, card-identified recent trades', () => {
    const t = parseRecentTrades(TRADES)
    expect(t).toHaveLength(1)
    expect(t[0]?.name).toBe('Monkey.D.Luffy')
    expect(t[0]?.priceUsdCents).toBe(70794)
  })

  it('throws on a malformed shape (→ quarantine upstream)', () => {
    expect(() => parseSearchResults('{"results":"nope"}')).toThrow()
    expect(() => parseIndices('not json')).toThrow()
  })
})
