import {
  type Database,
  distinctListingCards,
  indexMatchKey,
  recordSourceAttempt,
  replaceIndexMarket,
  upsertIndexPrice,
} from '@renaisslens/db'
import { indexApiConfigured } from '../config'
import type { SourceReport } from '../cycle'
import { matchIndexCard } from '../matchCard'
import { parseIndices, parseRecentTrades, parseSearchResults } from '../parsers/indexSchemas'
import { CollectorError } from '../politeClient'
import { getIndices, getRecentTrades, searchCards } from './indexClient'

export const INDEX_SOURCE = 'api-index'

// Cap per cycle: politeGet spaces all calls ≥2s, and the partner quota is
// 10k/day — pricing the richest N distinct cards keeps a cycle bounded (~N×2s).
const MAX_CARDS_PER_CYCLE = 40
// Stop the per-card loop after this many consecutive failures (host down /
// systematic breakage), so we don't burn the whole sweep on a dead endpoint.
const MAX_CONSECUTIVE_FAILURES = 5

/** A 401/403/429 means auth/quota, not a per-card miss — abort the loop, don't amplify. */
function isAuthOrQuota(err: unknown): boolean {
  return err instanceof CollectorError && /HTTP (401|403|429)/.test(String(err.causeErr))
}

/**
 * Renaiss OS Index cross-pricing. Fetches the display-only market panel
 * (indices + recent trades) and, for the richest distinct graded listings,
 * exact-matches each against /v1/search and stores the independent reference
 * price. Matching is exact-only (company|grade|set|number|language, ambiguous
 * variants skipped) — unmatched cards are never guessed. Resilient to a single
 * bad card, but breaks out on auth/quota errors instead of amplifying them.
 * Benign-skips entirely when unkeyed.
 */
export async function runIndexSource(db: Database): Promise<SourceReport> {
  if (!indexApiConfigured()) {
    return {
      source: INDEX_SOURCE,
      status: 'ok',
      detail: 'skipped — RENAISS_INDEX_API_KEY not set (index cross-pricing disabled)',
    }
  }

  const now = new Date().toISOString()
  const panelParts: string[] = []
  let reached = false

  // ── panel: index values + recent trades (display-only) ───────────────────
  try {
    const indices = parseIndices((await getIndices()).rawText)
    replaceIndexMarket(db, 'indices', JSON.stringify(indices), now)
    panelParts.push(`${indices.length} indices`)
    reached = true
  } catch (err) {
    panelParts.push(`indices failed (${short(err)})`)
  }
  try {
    const trades = parseRecentTrades((await getRecentTrades()).rawText)
    replaceIndexMarket(db, 'recent_trades', JSON.stringify(trades.slice(0, 20)), now)
    panelParts.push(`${trades.length} trades`)
    reached = true
  } catch (err) {
    panelParts.push(`trades failed (${short(err)})`)
  }

  // ── per-listing cross-reference (exact-match only) ───────────────────────
  const cards = distinctListingCards(db, MAX_CARDS_PER_CYCLE)
  const capped = cards.length === MAX_CARDS_PER_CYCLE // likely more distinct cards than we priced
  let matched = 0
  let consecutiveFailures = 0
  let aborted: string | null = null
  for (const card of cards) {
    try {
      const query = `${card.pokemon_name ?? card.name} ${card.set_name} ${card.card_number}`
      const results = parseSearchResults((await searchCards(query)).rawText)
      reached = true
      consecutiveFailures = 0
      const hit = matchIndexCard(
        {
          gradingCompany: card.grading_company,
          grade: card.grade,
          setName: card.set_name,
          cardNumber: card.card_number,
          language: card.language,
        },
        results,
      )
      // exact match required, and a non-positive upstream price is garbage, not $0
      if (hit === null || typeof hit.priceUsdCents !== 'number' || hit.priceUsdCents <= 0) continue
      upsertIndexPrice(
        db,
        {
          matchKey: indexMatchKey(
            card.grading_company,
            card.grade,
            card.set_name,
            card.card_number,
            card.language,
          ),
          game: hit.game ?? null,
          name: hit.name ?? null,
          setName: hit.setName ?? null,
          cardNumber: hit.cardNumber ?? null,
          gradingCompany: hit.company ?? null,
          grade: hit.grade ?? null,
          priceCents: Math.round(hit.priceUsdCents),
          currency: 'USD',
          confidence: hit.confidence ?? null,
          deltaPct: hit.deltaPct ?? null,
          lastSaleAt: hit.lastSaleAt ?? null,
          href: hit.href ?? null,
        },
        now,
      )
      matched++
    } catch (err) {
      // auth/quota errors are systemic — abort rather than amplify (429 retries)
      if (isAuthOrQuota(err)) {
        aborted = 'auth/quota error'
        break
      }
      // otherwise a single card's search/parse failure is skipped, unless the
      // endpoint is systematically failing
      consecutiveFailures++
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = `${consecutiveFailures} consecutive failures`
        break
      }
    }
  }

  // A total wall (e.g. 401 bad creds, host down) → nothing was reached: fail.
  if (!reached || aborted !== null) {
    const why = aborted ?? panelParts.join(', ')
    recordSourceAttempt(db, INDEX_SOURCE, { status: 'failed', error: why }, now)
    return { source: INDEX_SOURCE, status: 'failed', detail: `index sweep degraded: ${why}` }
  }
  recordSourceAttempt(db, INDEX_SOURCE, { status: 'ok' }, now)
  const capNote = capped ? ` (capped at ${MAX_CARDS_PER_CYCLE}; more distinct cards exist)` : ''
  return {
    source: INDEX_SOURCE,
    status: 'ok',
    detail: `${panelParts.join(', ')} · cross-referenced ${matched}/${cards.length} listings${capNote}`,
  }
}

function short(err: unknown): string {
  return String(err instanceof Error ? err.message : err).slice(0, 80)
}
