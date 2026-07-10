import { describe, expect, it } from 'vitest'
import { matchIndexCard } from '../src/matchCard'
import type { IndexCard } from '../src/parsers/indexSchemas'

const card = (over: Partial<IndexCard>): IndexCard => ({
  company: 'PSA',
  grade: '10 Gem Mint',
  setName: 'Pokemon Svp En-Sv Black Star Promo',
  cardNumber: '161',
  priceUsdCents: 5402,
  ...over,
})

const identity = {
  gradingCompany: 'PSA',
  grade: '10 Gem Mint',
  setName: 'Pokemon Svp En-Sv Black Star Promo',
  cardNumber: '161',
}

describe('matchIndexCard', () => {
  it('returns the exact match, ignoring noisy non-matching results', () => {
    const results = [
      card({ name: 'Zekrom Ex', setName: 'Pokemon Japanese Sv11b-Black Bolt', cardNumber: '161' }), // wrong set
      card({ name: 'Charizard Ex', priceUsdCents: 5402 }), // exact match
    ]
    const hit = matchIndexCard(identity, results)
    expect(hit?.name).toBe('Charizard Ex')
  })

  it('matches despite case/punctuation differences (normalized key)', () => {
    const results = [
      card({ setName: 'POKEMON  SVP  EN-SV  BLACK STAR PROMO', grade: '10 gem mint' }),
    ]
    expect(matchIndexCard(identity, results)).not.toBeNull()
  })

  it('returns null when nothing matches (never guesses)', () => {
    const results = [card({ cardNumber: '999' }), card({ company: 'CGC' })]
    expect(matchIndexCard(identity, results)).toBeNull()
  })

  it('returns null for an incomplete listing identity', () => {
    expect(matchIndexCard({ ...identity, cardNumber: null }, [card({})])).toBeNull()
  })

  it('skips a matching card with no numeric price', () => {
    expect(matchIndexCard(identity, [card({ priceUsdCents: null })])).toBeNull()
  })

  it('distinguishes grade (PSA 9 must not match a PSA 10 listing)', () => {
    const results = [card({ grade: '9 Mint' })]
    expect(matchIndexCard(identity, results)).toBeNull()
  })
})
