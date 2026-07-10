/**
 * Normalized card-identity key shared by the scraper (which stores Index prices
 * under it) and the web app (which joins listings to those prices in TS). Cards
 * in different languages are different products, but grading language is folded
 * into set/grade already, so the key is company|grade|set|number — lowercased,
 * punctuation-stripped, whitespace-collapsed. Both sides MUST use this function
 * so the join lines up.
 */
const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function indexMatchKey(
  gradingCompany: string | null | undefined,
  grade: string | null | undefined,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
): string {
  return [norm(gradingCompany), norm(grade), norm(setName), norm(cardNumber)].join('|')
}
