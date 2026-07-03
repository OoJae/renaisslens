import { z } from 'zod'

/**
 * Wire schemas — the ok/quarantine boundary for every source.
 * Objects are .passthrough() so ADDITIVE beta-API drift never breaks ingestion,
 * but required fields, money regexes, sentinels, and enums fail HARD → the
 * payload is quarantined with raw bytes preserved, and the DB stays untouched.
 */

const weiString = z.string().regex(/^\d+$/, 'expected unsigned wei string')
const centsString = z.string().regex(/^\d+$/, 'expected unsigned cents string')

export const PackStageSchema = z.enum(['countdown', 'active', 'soldout-or-restocking', 'archived'])
export const PackTypeSchema = z.enum(['limited', 'perpetual'])

/**
 * Tier vocabularies are PACK-SPECIFIC and open-ended — observed live:
 * TOP/S/A/B/C/D (OMEGA), legendary…common (RenaCrypt), thorn/bloom (Eden,
 * appeared 2026-07-03 and was caught by the quarantine boundary when this
 * was still a strict enum). Validate shape only; the EV engine buckets by
 * observed FMV, not by tier name.
 */
export const TierSchema = z.string().min(1).max(32)

export const PackSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    packType: PackTypeSchema,
    stage: PackStageSchema,
    description: z.string().nullish(),
    author: z.string().nullish(),
    priceInUsdt: weiString,
    expectedValueInUsd: centsString.nullish(),
    featuredCardFmvInUsd: centsString.nullish(),
  })
  .passthrough()

export const PacksResponseSchema = z.object({ cardPacks: z.array(PackSchema) }).passthrough()

export const RecentPullSchema = z
  .object({
    collectibleTokenId: z.string().regex(/^\d+$/),
    tier: TierSchema,
    fmv: centsString,
    pulledAtTimestamp: z.number().int().positive(),
  })
  .passthrough()

export const PackDetailResponseSchema = z
  .object({
    cardPack: PackSchema.extend({
      recentOpenedPacks: z.array(RecentPullSchema).nullish(),
    }).passthrough(),
  })
  .passthrough()

const NO_ASK = z.literal('NO-ASK-PRICE')
const NO_FMV = z.literal('NO-FMV-PRICE')

export const MarketplaceItemSchema = z
  .object({
    tokenId: z.string().regex(/^\d+$/),
    name: z.string().min(1),
    setName: z.string().nullish(),
    cardNumber: z.union([z.string(), z.number()]).nullish(),
    pokemonName: z.string().nullish(),
    ownerAddress: z.string().nullish(),
    askPriceInUSDT: z.union([weiString, NO_ASK]),
    askExpiresAt: z.string().nullish(),
    fmvPriceInUSD: z.union([centsString, NO_FMV]),
    attributes: z.array(z.object({ trait: z.string(), value: z.unknown() }).passthrough()).nullish(),
    vaultLocation: z.string().nullish(),
    gradingCompany: z.string().nullish(),
    grade: z.union([z.string(), z.number()]).nullish(),
    year: z.union([z.number(), z.string()]).nullish(),
    owner: z.object({ username: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough()

export const MarketplaceResponseSchema = z
  .object({
    collection: z.array(MarketplaceItemSchema),
    pagination: z
      .object({
        total: z.number().int(),
        limit: z.number().int(),
        offset: z.number().int(),
        hasMore: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough()

/**
 * Homepage "Latest Activities" — schema finalized against the live snapshot
 * captured 2026-07-03 (quarantine → inspect → finalize, the designed day-1
 * workflow). Next.js flight serialization prefixes scalar types:
 *   "$n<digits>" = BigInt (tokenId, value in wei-18 USDT, blockNumber)
 *   "$D<iso>"    = Date
 */
const flightBigInt = z.string().regex(/^\$n\d+$/, 'expected $n-prefixed bigint')
const flightDate = z.string().regex(/^\$D\d{4}-/, 'expected $D-prefixed ISO date')

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    tokenId: flightBigInt.nullish(),
    action: z.string().min(1),
    value: flightBigInt,
    transactionHash: z.string().nullish(),
    timestamp: flightDate.nullish(),
    createdAt: flightDate.nullish(),
    priceChangePercentage: z.number().nullish(),
    collectible: z.object({ name: z.string().min(1) }).passthrough().nullish(),
  })
  .passthrough()
export const ActivitiesSchema = z.array(ActivitySchema)

export type Pack = z.infer<typeof PackSchema>
export type PacksResponse = z.infer<typeof PacksResponseSchema>
export type PackDetailResponse = z.infer<typeof PackDetailResponseSchema>
export type RecentPull = z.infer<typeof RecentPullSchema>
export type MarketplaceItem = z.infer<typeof MarketplaceItemSchema>
export type MarketplaceResponse = z.infer<typeof MarketplaceResponseSchema>
export type Activity = z.infer<typeof ActivitySchema>
