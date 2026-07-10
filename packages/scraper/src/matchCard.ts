import { indexMatchKey } from '@renaisslens/db'
import type { IndexCard } from './parsers/indexSchemas'

export interface CardIdentity {
  gradingCompany: string | null
  grade: string | null
  setName: string | null
  cardNumber: string | null
}

/**
 * The exact-match rule: return the search result whose (company | grade | set |
 * number) key equals the listing's, or null. NEVER fuzzy — a partial identity
 * or no exact match yields null, so we only ever store a price we're confident
 * belongs to that card. Search is noisy (the top hit is often a different card),
 * which is exactly why we match on the key instead of taking results[0].
 */
export function matchIndexCard(identity: CardIdentity, results: IndexCard[]): IndexCard | null {
  if (!identity.gradingCompany || !identity.grade || !identity.setName || !identity.cardNumber) {
    return null
  }
  const key = indexMatchKey(
    identity.gradingCompany,
    identity.grade,
    identity.setName,
    identity.cardNumber,
  )
  const matches = results.filter(
    (r) =>
      typeof r.priceUsdCents === 'number' &&
      indexMatchKey(r.company, r.grade, r.setName, r.cardNumber) === key,
  )
  return matches[0] ?? null
}
