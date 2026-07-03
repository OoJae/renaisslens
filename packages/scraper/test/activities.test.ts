import { describe, expect, it } from 'vitest'
import { gradeFromTitle, normalizeActivities } from '../src/parsers/normalize'
import { ActivitiesSchema } from '../src/parsers/schemas'

/** Verbatim rows from the live snapshot of 2026-07-03 (wallet addresses truncated). */
const REAL_ACTIVITIES = [
  {
    id: '0xea45edb96f13b401b2a513ef8907d70651fb2e83cfdf8b532073a2acd0a47fd1-215-sell',
    tokenId: '$n100984063149841437746255216899132753492518200282566669061631468110195550885640',
    action: 'SELL',
    value: '$n236700000000000000000',
    tokenAddress: '0x55d398326f99059ff775485246999027b3197955',
    transactionHash: '0xea45edb96f13b401b2a513ef8907d70651fb2e83cfdf8b532073a2acd0a47fd1',
    timestamp: '$D2026-07-03T10:39:24.000Z',
    blockNumber: '$n107814204',
    collectible: {
      name: 'PSA 10 Gem Mint 2021 Pokemon Japanese Sword & Shield Vmax Climax #245 Umbreon Vmax',
      imageUrl: 'https://example.test/nft_image_silver.jpg',
    },
    priceChangePercentage: null,
    createdAt: '$D2026-07-03T10:39:24.000Z',
    updatedAt: null,
  },
  {
    id: '0xb4004303e30e917d057549f6c1bae8579dada8df63e509e2f48c90ae1b5416d1-592-sell',
    tokenId: '$n4545310135287005944558831283090121036616711931490266109500942399687987019322',
    action: 'SELL',
    value: '$n403200000000000000000',
    timestamp: '$D2026-07-03T10:31:52.000Z',
    collectible: {
      name: 'PSA 10 Gem Mint 2014 Pokemon Japanese Xy Super Legend Set #006 Yveltal Ex',
      imageUrl: 'https://example.test/nft_image_silver.jpg',
    },
    priceChangePercentage: null,
    createdAt: '$D2026-07-03T10:31:52.000Z',
    updatedAt: null,
  },
]

describe('ActivitiesSchema + normalizeActivities (golden, from live snapshot)', () => {
  it('validates and normalizes real feed rows', () => {
    const parsed = ActivitiesSchema.parse(REAL_ACTIVITIES)
    const sales = normalizeActivities(parsed)
    expect(sales).toHaveLength(2)

    const first = sales[0]
    expect(first).toMatchObject({
      activityId: '0xea45edb96f13b401b2a513ef8907d70651fb2e83cfdf8b532073a2acd0a47fd1-215-sell',
      cardTitle:
        'PSA 10 Gem Mint 2021 Pokemon Japanese Sword & Shield Vmax Climax #245 Umbreon Vmax',
      priceCents: 23670, // $236.70 from wei "$n236700000000000000000"
      gradingCompany: 'PSA',
      grade: '10',
      pctChange: null,
      soldAt: '2026-07-03T10:39:24.000Z',
      source: 'site:home-activities:flight',
    })
    expect(first?.tokenId).toBe(
      '100984063149841437746255216899132753492518200282566669061631468110195550885640',
    )
    expect(sales[1]?.priceCents).toBe(40320)
  })

  it('skips non-SELL actions without failing', () => {
    const withMint = [
      ...REAL_ACTIVITIES,
      { ...REAL_ACTIVITIES[0], id: '0xmint-1', action: 'MINT' },
    ]
    const sales = normalizeActivities(ActivitiesSchema.parse(withMint))
    expect(sales).toHaveLength(2)
  })

  it('rejects a shape drift (value no longer $n-prefixed)', () => {
    const drifted = [{ ...REAL_ACTIVITIES[0], value: '236700000000000000000' }]
    expect(() => ActivitiesSchema.parse(drifted)).toThrow()
  })
})

describe('gradeFromTitle', () => {
  it('extracts grader + grade from title prefixes', () => {
    expect(gradeFromTitle('PSA 10 Gem Mint 2021 Pokemon …')).toEqual({ company: 'PSA', grade: '10' })
    expect(gradeFromTitle('BGS 9.5 Gem Mint Luffy OP-01')).toEqual({ company: 'BGS', grade: '9.5' })
    expect(gradeFromTitle('CGC 8 Charizard')).toEqual({ company: 'CGC', grade: '8' })
    expect(gradeFromTitle('Sealed Booster Box')).toEqual({ company: null, grade: null })
  })
})
