import { describe, expect, it } from 'vitest'
import { matchIndexCard } from '../src/matchCard'
import type { IndexCard } from '../src/parsers/indexSchemas'

const card = (over: Partial<IndexCard>): IndexCard => ({
  company: 'PSA',
  grade: '10 Gem Mint',
  setName: 'Pokemon Svp En-Sv Black Star Promo',
  cardNumber: '161',
  language: 'English',
  variation: '',
  priceUsdCents: 5402,
  ...over,
})

const identity = {
  gradingCompany: 'PSA',
  grade: '10 Gem Mint',
  setName: 'Pokemon Svp En-Sv Black Star Promo',
  cardNumber: '161',
  language: 'English',
}

describe('matchIndexCard', () => {
  it('returns the exact match, ignoring noisy non-matching results', () => {
    const results = [
      card({ name: 'Zekrom Ex', setName: 'Pokemon Japanese Sv11b-Black Bolt', cardNumber: '161' }), // wrong set
      card({ name: 'Charizard Ex', priceUsdCents: 5402 }), // exact match
    ]
    expect(matchIndexCard(identity, results)?.name).toBe('Charizard Ex')
  })

  it('matches despite case/punctuation differences (normalized key)', () => {
    const results = [
      card({ setName: 'POKEMON  SVP  EN-SV  BLACK STAR PROMO', grade: '10 gem mint' }),
    ]
    expect(matchIndexCard(identity, results)).not.toBeNull()
  })

  it('returns null when nothing matches (never guesses)', () => {
    expect(
      matchIndexCard(identity, [card({ cardNumber: '999' }), card({ company: 'CGC' })]),
    ).toBeNull()
  })

  it('returns null for an incomplete listing identity', () => {
    expect(matchIndexCard({ ...identity, cardNumber: null }, [card({})])).toBeNull()
  })

  it('returns null when an identity segment normalizes to empty (punctuation-only)', () => {
    // a card number of "-" normalizes to "" and would otherwise over-match everything
    const junk = { ...identity, cardNumber: '-' }
    expect(matchIndexCard(junk, [card({ cardNumber: '-' })])).toBeNull()
  })

  it('distinguishes grade (PSA 9 must not match a PSA 10 listing)', () => {
    expect(matchIndexCard(identity, [card({ grade: '9 Mint' })])).toBeNull()
  })

  it('distinguishes language (an English listing must not take a Japanese price)', () => {
    expect(
      matchIndexCard(identity, [card({ language: 'Japanese', priceUsdCents: 99999 })]),
    ).toBeNull()
  })

  it('refuses to guess when two variants share the key (ambiguous)', () => {
    const results = [
      card({ variation: 'Base', priceUsdCents: 5000 }),
      card({ variation: 'Special Alternate Art', priceUsdCents: 50000 }),
    ]
    expect(matchIndexCard(identity, results)).toBeNull()
  })

  it('still matches when duplicate results share the SAME variation', () => {
    const results = [
      card({ variation: 'Base', priceUsdCents: 5000 }),
      card({ variation: 'Base', priceUsdCents: 5000 }),
    ]
    expect(matchIndexCard(identity, results)?.priceUsdCents).toBe(5000)
  })

  it('skips a matching card with no numeric price', () => {
    expect(matchIndexCard(identity, [card({ priceUsdCents: null })])).toBeNull()
  })
})
