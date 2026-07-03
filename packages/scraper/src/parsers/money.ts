/**
 * The ONLY module allowed to touch raw money strings.
 *
 * Renaiss API convention (inferred from field naming + live values, verified
 * 2026-07-03 — labeled `inferred` in METHODOLOGY.md):
 *   *InUSDT / *InUsdt  → 18-decimal wei string of USDT dollars
 *   *InUSD  / *InUsd   → integer cents string
 *
 * All arithmetic is BigInt. Floats appear only at display time in apps/web.
 */

export class MoneyParseError extends Error {
  constructor(raw: string, reason: string) {
    super(`MoneyParseError: ${reason} (raw=${JSON.stringify(raw.slice(0, 60))})`)
    this.name = 'MoneyParseError'
  }
}

const DIGITS = /^\d+$/
const WEI_PER_CENT = 10n ** 16n
const HALF_CENT_WEI = 5n * 10n ** 15n
const MAX_SAFE = 9_007_199_254_740_991n

/** "48000000000000000000" → 4800 (cents). Rounds half-up; sub-cent asks exist live. */
export function weiUsdtToCents(wei: string): number {
  if (!DIGITS.test(wei)) throw new MoneyParseError(wei, 'not an unsigned integer string')
  const cents = (BigInt(wei) + HALF_CENT_WEI) / WEI_PER_CENT
  if (cents > MAX_SAFE) throw new MoneyParseError(wei, 'exceeds Number.MAX_SAFE_INTEGER cents')
  return Number(cents)
}

/** "5184" → 5184 (cents, exact). */
export function usdCentsToInt(cents: string): number {
  if (!DIGITS.test(cents)) throw new MoneyParseError(cents, 'not an unsigned integer string')
  const v = BigInt(cents)
  if (v > MAX_SAFE) throw new MoneyParseError(cents, 'exceeds Number.MAX_SAFE_INTEGER cents')
  return Number(v)
}
