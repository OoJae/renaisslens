import Anthropic from '@anthropic-ai/sdk'
import { countPullsForPack, type Database, latestEvRuns, listPacks, openDb } from '@renaisslens/db'
import { HEADLINE_SCENARIO, MIN_PULLS_FOR_EV } from '@renaisslens/ev-engine'
import { NextResponse } from 'next/server'
import {
  appendCanonicalCaveat,
  buildExplainUserMessage,
  EXPLAINER_SYSTEM_PROMPT,
  toExplainInput,
} from '@/lib/explain-prompt'
import { toScenarioRun } from '@/lib/pack-data'
import { explainCache, explainCacheKey, explainLimiter } from '@/lib/server/explain-cache'
import { orderRuns, packEv } from '@/lib/verdict-ui'

export const dynamic = 'force-dynamic'

const DISCLAIMER = 'AI-generated explanation of statistical estimates — not financial advice.'

// friendly, no-internals bodies only — this endpoint is public (health-route precedent)
const err = (status: number, error: string, headers?: HeadersInit) =>
  NextResponse.json({ ok: false, error }, { status, headers })

export async function POST(request: Request) {
  // 1. not-configured gate FIRST — the .env.example contract: unset key ⇒ 503,
  // and the Anthropic client is never constructed
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return err(503, 'explainer not configured')
  }

  // 2. body validation
  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null
  const slug = body?.slug
  if (typeof slug !== 'string' || slug.length === 0) {
    return err(400, 'expected JSON body { slug }')
  }

  // 3. rate limit — every POST counts (protects the API key on a public URL)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = explainLimiter.check(ip)
  if (!limit.allowed) {
    return err(429, 'too many requests — try again shortly', {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  // 4. read the pack's current data state (readonly — the web app never writes)
  let db: Database | undefined
  let detail: ReturnType<typeof readExplainData>
  try {
    db = openDb(undefined, { readonly: true })
    detail = readExplainData(db, slug)
  } catch {
    return err(503, 'database not ready')
  } finally {
    db?.close()
  }
  if (detail.kind === 'unknown') return err(404, 'unknown pack')
  if (detail.kind === 'insufficient') {
    return err(
      409,
      'not enough observed pulls to explain — RenaissLens refuses to publish an EV range below ' +
        `${MIN_PULLS_FOR_EV} pulls`,
    )
  }

  const model = process.env.RENAISSLENS_EXPLAINER_MODEL?.trim() || 'claude-opus-4-8'
  const ranAt = detail.input.ranAt

  // 5. cache — keyed by data state, so a fresh `pnpm ev:run` invalidates naturally
  const key = explainCacheKey(slug, ranAt, model)
  const hit = explainCache.get(key)
  if (hit !== null) {
    return NextResponse.json({
      ok: true,
      explanation: hit.explanation,
      model: hit.model,
      ranAt: hit.ranAt,
      cached: true,
      truncated: false,
      disclaimer: DISCLAIMER,
    })
  }

  // 6. the LLM call. The endpoint speaks the Anthropic protocol; base URL is
  // configurable so this works against Anthropic (default) or any compatible
  // provider (e.g. Xiaomi MiMo). No sampling params, no prefill, and no
  // `thinking` param — the latter is Claude-4.x-specific and a compatible
  // endpoint may reject it; a 250-word explanation of precomputed numbers
  // doesn't need it.
  try {
    const baseURL = process.env.RENAISSLENS_EXPLAINER_BASE_URL?.trim() || undefined
    const client = new Anthropic({ baseURL })
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: EXPLAINER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildExplainUserMessage(detail.input) }],
    })

    // 7. stop_reason before content
    if (response.stop_reason === 'refusal') {
      return err(502, 'the model declined to generate an explanation')
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')
      .trim()
    if (text.length === 0) {
      return err(502, 'the explainer had a problem — try again shortly')
    }
    const truncated = response.stop_reason === 'max_tokens'

    // 8. server-side caveat enforcement — safety text never depends on model compliance
    const explanation = appendCanonicalCaveat(text)
    if (!truncated) explainCache.set(key, { explanation, model, ranAt })

    return NextResponse.json({
      ok: true,
      explanation,
      model,
      ranAt,
      cached: false,
      truncated,
      disclaimer: DISCLAIMER,
    })
  } catch (e) {
    // typed classes, most-specific-first; APIConnectionError subclasses APIError in the TS SDK.
    // No err.message ever reaches a response body.
    if (e instanceof Anthropic.AuthenticationError) {
      return err(503, 'explainer not configured') // invalid key ≡ not configured
    }
    if (e instanceof Anthropic.RateLimitError) {
      return err(429, 'the explainer is busy — try again in a minute')
    }
    return err(502, 'the explainer had a problem — try again shortly')
  }
}

type ExplainData =
  | { kind: 'unknown' }
  | { kind: 'insufficient' }
  | { kind: 'ok'; input: ReturnType<typeof toExplainInput> }

function readExplainData(db: Database, slug: string): ExplainData {
  const pack = listPacks(db).find((p) => p.slug === slug)
  if (pack === undefined) return { kind: 'unknown' }
  let evRuns: ReturnType<typeof latestEvRuns> = []
  try {
    evRuns = latestEvRuns(db)
  } catch {
    evRuns = [] // pre-0002 schema → treat as no EV data
  }
  const runs = orderRuns(evRuns.filter((r) => r.pack_slug === slug)).map(toScenarioRun)
  const pullCount = countPullsForPack(db, slug)
  const neutral = runs.find((r) => r.row.scenario === HEADLINE_SCENARIO)
  if (runs.length === 0 || pullCount < MIN_PULLS_FOR_EV || neutral === undefined) {
    return { kind: 'insufficient' }
  }
  const verdict = packEv({ runs: runs.map((r) => r.row), pullCount }, pack.price_cents)
  return { kind: 'ok', input: toExplainInput(pack, runs, pullCount, verdict, neutral) }
}
