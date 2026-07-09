/**
 * Frequentist/empirical uncertainty for the observed-outcomes fairness
 * observatory: a confidence interval on a single tier's pull proportion, and a
 * confidence interval on the mean realized pull value. Pure, zero-dep, and —
 * for the bootstrap — seeded so a published interval is reproducible from the
 * same data state, exactly like the EV engine's Monte Carlo.
 *
 * These describe what the OBSERVED feed actually paid out. They are not a test
 * of Renaiss's true odds (which are unknown) and not a fairness verification.
 */
import { mulberry32, seedFromString } from './rng'
import { quantileSorted } from './simulate'

export interface ProportionInterval {
  /** Observed proportion k/n, or null when n = 0 (nothing observed). */
  point: number | null
  lo: number
  hi: number
  k: number
  n: number
}

/** z for a two-sided 95% interval: Φ⁻¹(0.975). */
export const Z_95 = 1.959963984540054

/**
 * Wilson score interval for a binomial proportion — the primary per-tier CI.
 * Chosen over a Jeffreys binomial interval because it is a closed form with no
 * special functions, is bounded in [0, 1], and stays sensible at k = 0, k = n,
 * and small n. It honours the same Jeffreys-0.5 skepticism the EV engine applies
 * to tier counts, but is NOT numerically identical to the engine's Dirichlet
 * marginal (which spreads 0.5 across every tier) — so copy should say "the same
 * skepticism," never "the same interval."
 */
export function wilsonInterval(k: number, n: number, z: number = Z_95): ProportionInterval {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new Error(`wilsonInterval: need integers 0 <= k <= n, got k=${k}, n=${n}`)
  }
  // n = 0: nothing observed → the honest interval is the whole line, no point.
  if (n === 0) return { point: null, lo: 0, hi: 1, k, n }

  const pHat = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (pHat + z2 / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * n)) / n)
  // k = 0 / k = n put a true boundary at 0 / 1; pin them exactly (the closed
  // form lands on 0.999…9 there from floating-point rounding).
  return {
    point: pHat,
    lo: k === 0 ? 0 : Math.max(0, center - margin),
    hi: k === n ? 1 : Math.min(1, center + margin),
    k,
    n,
  }
}

/**
 * Jeffreys interval — a Bayesian alternative (Beta(k+0.5, n−k+0.5) posterior),
 * offered for coherence with the engine's Jeffreys-0.5 convention. Uses an
 * inverse regularized incomplete beta. Prefer `wilsonInterval` unless Bayesian
 * coherence with the EV panel is judged worth the extra numerics.
 */
export function jeffreysInterval(k: number, n: number, level = 0.95): ProportionInterval {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new Error(`jeffreysInterval: need integers 0 <= k <= n, got k=${k}, n=${n}`)
  }
  if (n === 0) return { point: null, lo: 0, hi: 1, k, n }

  const a = k + 0.5
  const b = n - k + 0.5
  const alpha = 1 - level
  // Standard one-sided boundary modification (Brown–Cai–DasGupta 2001).
  const lo = k === 0 ? 0 : betaInv(alpha / 2, a, b)
  const hi = k === n ? 1 : betaInv(1 - alpha / 2, a, b)
  return { point: (k + 0.5) / (n + 1), lo, hi, k, n }
}

export interface MeanInterval {
  mean: number
  lo: number
  hi: number
  n: number
}

/**
 * Seeded percentile bootstrap for the mean of a sample. Pull FMVs are
 * heavy-tailed (most pulls modest, rare top-tier huge), so a normal/t interval
 * on the mean understates uncertainty; the bootstrap is distribution-free. The
 * seed makes the published interval reproducible from the same data state.
 */
export function bootstrapMeanCI(
  values: readonly number[],
  opts: { seed: number | string; level?: number; resamples?: number },
): MeanInterval {
  const n = values.length
  if (n === 0) throw new Error('bootstrapMeanCI: empty sample')
  const level = opts.level ?? 0.95
  const resamples = opts.resamples ?? 2000

  const raw = values.reduce((acc, v) => acc + v, 0) / n
  // A one-element (or constant) sample has no spread to resample — degenerate.
  if (n === 1) return { mean: raw, lo: raw, hi: raw, n }

  const seed = typeof opts.seed === 'string' ? seedFromString(opts.seed) : opts.seed >>> 0
  const rng = mulberry32(seed)
  const means = new Float64Array(resamples)
  for (let b = 0; b < resamples; b++) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      // index in [0, n-1]; `n * rng()` never reaches n since rng() < 1.
      const idx = Math.floor(rng() * n)
      sum += values[idx] ?? 0
    }
    means[b] = sum / n
  }
  means.sort()
  const alpha = 1 - level
  return {
    mean: raw,
    lo: quantileSorted(means, alpha / 2),
    hi: quantileSorted(means, 1 - alpha / 2),
    n,
  }
}

// ── inverse regularized incomplete beta (for jeffreysInterval) ──────────────
// Bisection over the monotone CDF I_x(a,b); robust and always converges on
// [0, 1]. Not perf-critical — a handful of calls per fairness render.

/** Inverse of the regularized incomplete beta: find x with I_x(a,b) = p. */
function betaInv(p: number, a: number, b: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (regIncBeta(mid, a, b) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-12) break
  }
  return (lo + hi) / 2
}

/** Regularized incomplete beta I_x(a,b) via the Lentz continued fraction. */
function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b)
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a
  // Continued fraction converges fast for x < (a+1)/(a+b+2); else use symmetry.
  if (x < (a + 1) / (a + b + 2)) return front * betacf(x, a, b)
  return 1 - (Math.exp(b * Math.log(1 - x) + a * Math.log(x) - lnBeta) / b) * betacf(1 - x, b, a)
}

/** Modified Lentz's method for the beta continued fraction (Numerical Recipes). */
function betacf(x: number, a: number, b: number): number {
  const tiny = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return h
}

/** Lanczos approximation of ln Γ(z). */
function lgamma(z: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  }
  const zz = z - 1
  let x = c[0] as number
  for (let i = 1; i < g + 2; i++) x += (c[i] as number) / (zz + i)
  const t = zz + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}
