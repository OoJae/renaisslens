/** Confidence label carried by every model input. */
export type Confidence = 'observed' | 'inferred' | 'assumed'

export interface Assumption {
  name: string
  value: string | number
  source: string
  confidence: Confidence
}

export interface EvScenario {
  /** e.g. 'generous' | 'neutral' | 'house-favored' */
  name: string
  assumptions: Assumption[]
}

export interface HistogramBin {
  loCents: number
  hiCents: number
  count: number
}

export interface EvResult {
  packSlug: string
  scenario: string
  /**
   * cents — EV is ALWAYS a range, never a single point. Percentiles of the
   * EV distribution under parameter uncertainty (odds redrawn every
   * iteration), NOT percentiles of single-pull luck.
   */
  p10Cents: number
  p50Cents: number
  p90Cents: number
  /**
   * P(one pull's value >= pack price) — single-pull posterior predictive.
   * `null` when the scenario models no pull-level distribution (reference-prior):
   * "not modeled" is honestly null, never a fabricated 0.
   */
  probBreakEven: number | null
  /** P(one pull hits the top prize) — driven entirely by the assumed odds band; `null` when not modeled */
  probTopPrize: number | null
  /** P(the pack's EV exceeds its price) under parameter uncertainty — drives the verdict */
  probEvAbovePrice: number
  /**
   * Mean of the EV samples — a model diagnostic used by tests against
   * closed-form answers. NEVER displayed alone: the UI shows p10–p90 ranges.
   */
  evMeanCents: number
  iterations: number
  seed: number
  assumptions: Assumption[]
  /** log-spaced bins for the M3 histogram; `histogramOf` says what the bins measure */
  histogram?: HistogramBin[]
  /** 'pull' = single-pull values (mixture); 'ev' = EV spread (reference-prior, which models no pull) */
  histogramOf?: 'pull' | 'ev'
}
