import { describe, expect, it } from 'vitest'
import {
  appendCanonicalCaveat,
  buildExplainUserMessage,
  CANONICAL_CAVEAT,
  EXPLAINER_SYSTEM_PROMPT,
  type ExplainInput,
} from './explain-prompt'

const input: ExplainInput = {
  packName: 'OMEGA',
  priceCents: 4800,
  renaissClaimedEvCents: 5184,
  topPrizeFmvCents: 153_200,
  pullCount: 30,
  scenarios: [
    {
      scenario: 'neutral',
      p10Cents: 4248,
      p50Cents: 6065,
      p90Cents: 10_441,
      probEvAbovePrice: 0.766,
      probBreakEven: 0.15,
      probTopPrize: 0.0007,
    },
    {
      scenario: 'reference-prior',
      p10Cents: 3025,
      p50Cents: 3599,
      p90Cents: 4177,
      probEvAbovePrice: 0,
      probBreakEven: null,
      probTopPrize: null,
    },
  ],
  verdict: 'uncertain',
  verdictReason: 'P(EV > price) = 100% generous / 77% neutral / 24% house-favored',
  assumptions: [
    {
      name: 'pack_price_cents',
      value: 4800,
      confidence: 'observed',
      source: 'api-packs snapshot #4',
    },
    {
      name: 'fmv_haircut',
      value: 0.9,
      confidence: 'assumed',
      source: 'FMV is Renaiss’s own valuation',
    },
  ],
  ranAt: '2026-07-03T19:55:25.149Z',
  inputSnapshotIds: '[4]',
}

describe('EXPLAINER_SYSTEM_PROMPT (the judged guardrails)', () => {
  it('restricts the model to provided numbers only', () => {
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('ONLY the numbers provided in the DATA block')
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('do not invent or recall it')
  })

  it('refuses buy/sell advice and redirects to the methodology', () => {
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('Never give buy or sell advice')
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('Methodology page')
  })

  it('bans single-point EV and demands hedged language', () => {
    expect(EXPLAINER_SYSTEM_PROMPT).toContain(
      "never reduce the pack's expected value to a single number",
    )
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('estimates under uncertainty, never facts')
  })

  it('labels Renaiss claims as claims and demands assumption labeling', () => {
    expect(EXPLAINER_SYSTEM_PROMPT).toContain("Renaiss's claim, not as ground truth")
    expect(EXPLAINER_SYSTEM_PROMPT).toContain('observed, inferred, or assumed')
  })

  it('embeds the canonical caveat verbatim', () => {
    expect(EXPLAINER_SYSTEM_PROMPT).toContain(CANONICAL_CAVEAT)
  })
})

describe('buildExplainUserMessage', () => {
  const message = buildExplainUserMessage(input)

  it('renders exact dollar figures from cents', () => {
    expect(message).toContain('price $48.00 [observed]')
    expect(message).toContain('$42.48 – $60.65 – $104.41')
    expect(message).toContain('Top prize FMV: $1,532.00')
  })

  it('labels the claimed EV as Renaiss’s claim, never ours', () => {
    expect(message).toContain("$51.84 [Renaiss's claim — shown for contrast, not our estimate]")
  })

  it('renders probabilities and treats nulls as "not modeled", never 0%', () => {
    expect(message).toContain('P(EV > price) 76.6%')
    expect(message).toContain('break-even not modeled')
    expect(message).toContain('top prize not modeled')
    expect(message).not.toMatch(/break-even 0%.*reference-prior|reference-prior.*break-even 0%/s)
  })

  it('carries confidence tags, pull count, verdict, and data vintage', () => {
    expect(message).toContain('[assumed]')
    expect(message).toContain('Observed pulls in the public feed: 30')
    expect(message).toContain('Verdict: uncertain —')
    expect(message).toContain('EV computed 2026-07-03T19:55:25.149Z from snapshot(s) [4]')
  })

  it('never exposes a single-point EV mean', () => {
    expect(message).not.toContain('ev_mean')
    expect(message).not.toContain('mean EV')
  })
})

describe('appendCanonicalCaveat', () => {
  it('appends the caveat when the model omitted it', () => {
    const out = appendCanonicalCaveat('The model estimates a range.')
    expect(out).toBe(`The model estimates a range.\n\n${CANONICAL_CAVEAT}`)
  })

  it('is idempotent', () => {
    const once = appendCanonicalCaveat('Some prose here.')
    expect(appendCanonicalCaveat(once)).toBe(once)
  })

  it('replaces a paraphrased model-emitted caveat with the canonical one', () => {
    const out = appendCanonicalCaveat(
      'Prose paragraph.\n\n⚠️ This is AI stuff, do not trust it, paraphrased badly.',
    )
    expect(out).toBe(`Prose paragraph.\n\n${CANONICAL_CAVEAT}`)
  })

  it('collapses duplicated caveats to one', () => {
    const out = appendCanonicalCaveat(`Prose.\n\n${CANONICAL_CAVEAT}\n\n${CANONICAL_CAVEAT}`)
    expect(out).toBe(`Prose.\n\n${CANONICAL_CAVEAT}`)
  })

  it('yields just the caveat for empty input', () => {
    expect(appendCanonicalCaveat('')).toBe(CANONICAL_CAVEAT)
  })
})
