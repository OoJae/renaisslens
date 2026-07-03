import type { Rng } from './rng'

/** Standard normal via Box–Muller. `1 - rng()` keeps the log argument in (0, 1]. */
export function normal(rng: Rng): number {
  const u = 1 - rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Gamma(shape, 1) via Marsaglia–Tsang. Shapes below 1 use the boost identity
 * Gamma(a) = Gamma(a+1) · U^(1/a). Rejection loops stay deterministic under a
 * seeded RNG — same seed, same draw sequence, same result.
 */
export function gammaSample(shape: number, rng: Rng): number {
  if (!Number.isFinite(shape) || shape <= 0) {
    throw new Error(`gammaSample: shape must be > 0, got ${shape}`)
  }
  if (shape < 1) {
    const u = 1 - rng()
    return gammaSample(shape + 1, rng) * u ** (1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = normal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = 1 - rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** One Dirichlet(alphas) draw — normalized independent gammas. */
export function dirichlet(alphas: number[], rng: Rng): number[] {
  const draws = alphas.map((a) => gammaSample(a, rng))
  const sum = draws.reduce((acc, g) => acc + g, 0)
  return draws.map((g) => g / sum)
}

export function uniform(lo: number, hi: number, rng: Rng): number {
  return lo + rng() * (hi - lo)
}

/**
 * Log-uniform on [lo, hi] — equal mass per order of magnitude, the honest
 * spread for an odds band we can only bound, not estimate. The degenerate
 * band [0, 0] means "this component is off" and returns 0.
 */
export function logUniform(lo: number, hi: number, rng: Rng): number {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) {
    throw new Error(`logUniform: need 0 <= lo <= hi, got [${lo}, ${hi}]`)
  }
  if (hi === 0) return 0
  if (lo === 0) throw new Error('logUniform: lo must be > 0 when hi > 0')
  if (lo === hi) return lo
  return Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)))
}
