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
import { getIndices, getRecentTrades, searchCards } from './indexClient'

export const INDEX_SOURCE = 'api-index'

// Cap per cycle: politeGet spaces all calls ≥2s, and the partner quota is
// 10k/day — pricing the richest N distinct cards keeps a cycle bounded (~N×2s).
const MAX_CARDS_PER_CYCLE = 40

/**
 * Renaiss OS Index cross-pricing. Fetches the display-only market panel
 * (indices + recent trades) and, for the richest distinct graded listings,
 * exact-matches each against /v1/search and stores the independent reference
 * price. Matching is exact-only (company|grade|set|number) — unmatched cards
 * are skipped, never guessed. Resilient: one bad card/response is skipped, not
 * fatal. Benign-skips entirely when unkeyed.
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
  let matched = 0
  for (const card of cards) {
    try {
      const query = `${card.pokemon_name ?? card.name} ${card.set_name} ${card.card_number}`
      const results = parseSearchResults((await searchCards(query)).rawText)
      reached = true
      const hit = matchIndexCard(
        {
          gradingCompany: card.grading_company,
          grade: card.grade,
          setName: card.set_name,
          cardNumber: card.card_number,
        },
        results,
      )
      if (hit === null || typeof hit.priceUsdCents !== 'number') continue
      upsertIndexPrice(
        db,
        {
          matchKey: indexMatchKey(
            card.grading_company,
            card.grade,
            card.set_name,
            card.card_number,
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
    } catch {
      // one card's search/parse failure is not fatal — skip it
    }
  }

  // A total wall (e.g. 401 bad creds, host down) → nothing was reached: fail.
  if (!reached) {
    recordSourceAttempt(db, INDEX_SOURCE, { status: 'failed', error: panelParts.join(', ') }, now)
    return {
      source: INDEX_SOURCE,
      status: 'failed',
      detail: `no index data reached: ${panelParts.join(', ')}`,
    }
  }
  recordSourceAttempt(db, INDEX_SOURCE, { status: 'ok' }, now)
  return {
    source: INDEX_SOURCE,
    status: 'ok',
    detail: `${panelParts.join(', ')} · cross-referenced ${matched}/${cards.length} listings`,
  }
}

function short(err: unknown): string {
  return String(err instanceof Error ? err.message : err).slice(0, 80)
}
