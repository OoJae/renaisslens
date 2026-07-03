export { mulberry32, seedFromString, type Rng } from './rng'

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

export interface EvResult {
  packSlug: string
  scenario: string
  /** cents — EV is ALWAYS a range, never a single point */
  p10Cents: number
  p50Cents: number
  p90Cents: number
  probBreakEven: number
  probTopPrize: number
  iterations: number
  seed: number
  assumptions: Assumption[]
}

/**
 * Monte Carlo pack EV simulation. Implemented in Milestone 2.
 * The signature is fixed now so the web app and ev_runs schema can build
 * against it.
 */
export function simulatePack(_input: {
  packSlug: string
  priceCents: number
  scenario: EvScenario
  seed: number
  iterations?: number
}): EvResult {
  throw new Error('NotImplemented: ev-engine lands in Milestone 2')
}
