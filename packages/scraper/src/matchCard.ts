import { indexMatchKey, normSegment } from '@renaisslens/db'
import type { IndexCard } from './parsers/indexSchemas'

export interface CardIdentity {
  gradingCompany: string | null
  grade: string | null
  setName: string | null
  cardNumber: string | null
  language: string | null
}

/**
 * The exact-match rule: return the single search result whose
 * (company | grade | set | number | language) key equals the listing's, or
 * null. NEVER fuzzy, and NEVER a guess between variants:
 *   - every identity segment must be non-empty after normalization (a
 *     punctuation-only card number would otherwise normalize to "" and
 *     over-match everything);
 *   - among the results that share the key, if two carry a DIFFERENT `variation`
 *     (base vs alt-art / 1st-edition / holo — which listings can't disambiguate),
 *     the match is ambiguous and we return null rather than picking one.
 * So a stored Index price always belongs unambiguously to that exact card.
 */
export function matchIndexCard(identity: CardIdentity, results: IndexCard[]): IndexCard | null {
  const segments = [
    identity.gradingCompany,
    identity.grade,
    identity.setName,
    identity.cardNumber,
    identity.language,
  ]
  // require a COMPLETE identity — reject if any segment is missing or normalizes to empty
  if (segments.some((s) => normSegment(s) === '')) return null

  const key = indexMatchKey(
    identity.gradingCompany,
    identity.grade,
    identity.setName,
    identity.cardNumber,
    identity.language,
  )
  const matches = results.filter(
    (r) =>
      typeof r.priceUsdCents === 'number' &&
      indexMatchKey(r.company, r.grade, r.setName, r.cardNumber, r.language) === key,
  )
  if (matches.length === 0) return null

  // ambiguous variation among same-key results → don't guess which variant it is
  const variations = new Set(matches.map((r) => normSegment(r.variation)))
  if (variations.size > 1) return null

  return matches[0] ?? null
}
