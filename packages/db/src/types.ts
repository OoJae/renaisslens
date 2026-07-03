export type SnapshotStatus = 'ok' | 'quarantined' | 'failed'
export type DataMode = 'live' | 'mock'

export interface SnapshotRow {
  id: number
  source: string
  cycle_id: string
  url: string
  raw_path: string
  parsed_path: string | null
  content_sha256: string
  http_status: number | null
  fetched_at: string
  status: SnapshotStatus
  error: string | null
}

export interface NewSnapshot {
  source: string
  cycleId: string
  url: string
  rawPath: string
  parsedPath?: string | null
  contentSha256: string
  httpStatus?: number | null
  fetchedAt: string
  status: SnapshotStatus
  error?: string | null
}

export interface PackRow {
  slug: string
  name: string
  pack_type: string
  stage: string
  description: string | null
  author: string | null
  price_cents: number
  expected_value_cents: number | null
  featured_card_fmv_cents: number | null
  first_seen_at: string
  last_seen_at: string
  source: string
  snapshot_id: number
}

export interface NewPack {
  slug: string
  name: string
  packType: string
  stage: string
  description: string | null
  author: string | null
  priceCents: number
  expectedValueCents: number | null
  featuredCardFmvCents: number | null
}

export interface PullRow {
  id: number
  pack_slug: string
  collectible_token_id: string
  tier: string
  fmv_cents: number
  pulled_at: number
  first_seen_at: string
  snapshot_id: number
}

export interface NewPull {
  packSlug: string
  collectibleTokenId: string
  tier: string
  fmvCents: number
  pulledAt: number
}

export interface ListingRow {
  token_id: string
  name: string
  set_name: string | null
  card_number: string | null
  pokemon_name: string | null
  grading_company: string | null
  grade: string | null
  year: number | null
  language: string | null
  vault_location: string | null
  owner_address: string | null
  owner_username: string | null
  ask_price_cents: number | null
  ask_expires_at: string | null
  fmv_cents: number | null
  attributes_json: string | null
  first_seen_at: string
  observed_at: string
  snapshot_id: number
}

export interface NewListing {
  tokenId: string
  name: string
  setName: string | null
  cardNumber: string | null
  pokemonName: string | null
  gradingCompany: string | null
  grade: string | null
  year: number | null
  language: string | null
  vaultLocation: string | null
  ownerAddress: string | null
  ownerUsername: string | null
  askPriceCents: number | null
  askExpiresAt: string | null
  fmvCents: number | null
  attributesJson: string | null
}

export interface SaleRow {
  id: number
  activity_id: string
  token_id: string | null
  card_title: string
  set_name: string | null
  grade: string | null
  grading_company: string | null
  price_cents: number
  pct_change: number | null
  sold_at: string | null
  observed_at: string
  source: string
  snapshot_id: number
}

export interface NewSale {
  activityId: string
  tokenId: string | null
  cardTitle: string
  setName: string | null
  grade: string | null
  gradingCompany: string | null
  priceCents: number
  pctChange: number | null
  soldAt: string | null
  source: string
}

export interface SourceFreshness {
  source: string
  last_attempt_at: string
  last_success_at: string | null
  last_status: string
  last_error: string | null
  consecutive_failures: number
}

export interface TierBucket {
  tier: string
  n: number
  avg_fmv_cents: number
  min_fmv_cents: number
  max_fmv_cents: number
}
