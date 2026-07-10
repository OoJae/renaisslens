/**
 * Normalized card-identity key shared by the scraper (which stores Index prices
 * under it) and the web app (which joins listings to those prices in TS). The
 * key is company|grade|set|number|language — lowercased, punctuation-stripped,
 * whitespace-collapsed. Language is part of the key because cards in different
 * languages are genuinely different products (an EN listing must not inherit a
 * JP card's price). Both sides MUST use this function so the join lines up.
 *
 * Note: card `variation` (base vs alt-art / 1st-edition / holo) is NOT in the
 * key because listings don't carry it — matchIndexCard handles variation by
 * refusing to guess when the key is ambiguous.
 */
export const normSegment = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function indexMatchKey(
  gradingCompany: string | null | undefined,
  grade: string | null | undefined,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  language: string | null | undefined,
): string {
  return [
    normSegment(gradingCompany),
    normSegment(grade),
    normSegment(setName),
    normSegment(cardNumber),
    normSegment(language),
  ].join('|')
}
