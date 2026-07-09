import { indexApiConfigured } from '../config'
import type { SourceReport } from '../cycle'

export const INDEX_SOURCE = 'api-index'

/**
 * PROVISIONAL — this types OUR normalized target, not a validated model of the
 * Renaiss Index API payload. The RAW response type is intentionally NOT defined:
 * fill it against real bytes on activation (see docs/index-api-activation.md),
 * ideally via codegen. Do not import into any EV/DB path until a Zod schema
 * built from a real sample exists. Building a parser against a guessed shape is
 * exactly the fabrication this project's quarantine machinery exists to prevent.
 */
export interface IndexCrossRef {
  /** independent reference price for a card, in cents */
  priceCents: number
  /** ISO timestamp the reference was observed/valid */
  asOfIso: string
  /** which index/source produced the figure */
  source: string
  sampleSize?: number
  methodologyNote?: string
}
// TODO(activation): define RawIndexResponse from a real sample / openapi-typescript.

/**
 * Dormant index-pricing source. It benign-skips BEFORE any network call, so a
 * process that has a key set but no parser yet neither hits the network nor
 * fabricates a response. This is the exact seam activation fills: replace the
 * keyed branch with a `politeGet(url, { source: INDEX_SOURCE, headers: { … } })`,
 * parse the real bytes, load them, and add the cadence in config.ts.
 */
export async function runIndexSource(): Promise<SourceReport> {
  if (!indexApiConfigured()) {
    return {
      source: INDEX_SOURCE,
      status: 'ok',
      detail: 'skipped — RENAISS_INDEX_API_KEY not set (index pricing planned, not integrated)',
    }
  }
  return {
    source: INDEX_SOURCE,
    status: 'ok',
    detail: 'skipped — parser not implemented; see docs/index-api-activation.md',
  }
}
