'use client'

import type { HistogramBin } from '@renaisslens/ev-engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatInt, usd, usdCompact } from '@/lib/format'

export interface ScenarioHistogramData {
  scenario: string
  bins: HistogramBin[]
  p10Cents: number | null
  p50Cents: number | null
  p90Cents: number | null
  probEvAbovePrice: number | null
  histogramOf: 'pull' | 'ev' | null
  iterations: number | null
}

interface Props {
  scenarios: ScenarioHistogramData[]
  priceCents: number
  initialScenario?: string
}

const DURATION_MS = 1200
const BAR_STAGGER_FRACTION = 0.5 / 1.2 // bars start over the first 0.5s of a 1.2s run
const BAR_GROW_MS = 700

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// SVG geometry (viewBox units)
const W = 720
const H = 260
const M = { top: 26, right: 10, bottom: 30, left: 10 }
const plotW = W - M.left - M.right
const plotH = H - M.top - M.bottom

/** Value → x through the log-spaced bins: piecewise-linear inside each band. */
function valueToX(bins: HistogramBin[], bandW: number, value: number): number | null {
  const first = bins[0]
  const last = bins[bins.length - 1]
  if (first === undefined || last === undefined) return null
  if (value <= first.loCents) return 0
  if (value >= last.hiCents) return bins.length * bandW
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i]
    if (bin === undefined) continue
    if (value >= bin.loCents && value < bin.hiCents) {
      const inner =
        bin.hiCents > bin.loCents ? (value - bin.loCents) / (bin.hiCents - bin.loCents) : 0
      return (i + inner) * bandW
    }
  }
  return null
}

/**
 * The one orchestrated motion moment: the Monte Carlo "runs" on load — bars
 * sweep in left to right while the draw counter ticks to 100,000. The server
 * render IS the final chart (no hydration flash, no-JS sees a complete chart);
 * prefers-reduced-motion never animates.
 */
export function MonteCarloHistogram({ scenarios, priceCents, initialScenario }: Props) {
  const firstScenario = scenarios[0]
  const [active, setActive] = useState(
    initialScenario ?? (firstScenario !== undefined ? firstScenario.scenario : ''),
  )
  const [progress, setProgress] = useState(1) // 1 = final chart (SSR state)
  const rafRef = useRef<number | null>(null)
  const reducedRef = useRef(false)

  const play = useCallback(() => {
    if (reducedRef.current) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const tick = (now: number) => {
      const t = clamp01((now - start) / DURATION_MS)
      setProgress(t)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    setProgress(0)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    play()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [play])

  const data = scenarios.find((s) => s.scenario === active) ?? firstScenario
  if (data === undefined || data.bins.length === 0) {
    return (
      <p className="rounded border border-vault-700 p-4 text-sm text-zinc-500">
        No histogram persisted for this run — re-run <code>pnpm ev:run</code>.
      </p>
    )
  }

  const bins = data.bins
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const bandW = plotW / bins.length
  const priceX = valueToX(bins, bandW, priceCents)
  const shownIterations = Math.round(easeOutCubic(progress) * (data.iterations ?? 0))
  const linesVisible = progress > 0.85

  const percentiles: { label: string; cents: number | null }[] = [
    { label: 'P10', cents: data.p10Cents },
    { label: 'P50', cents: data.p50Cents },
    { label: 'P90', cents: data.p90Cents },
  ]

  const tickIndices = [
    0,
    Math.floor(bins.length / 4),
    Math.floor(bins.length / 2),
    Math.floor((3 * bins.length) / 4),
    bins.length - 1,
  ]

  return (
    <div className="rounded border border-vault-700 bg-vault-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <fieldset className="flex flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">Scenario</legend>
          {scenarios.map((s) => (
            <button
              key={s.scenario}
              type="button"
              aria-pressed={s.scenario === active}
              onClick={() => {
                setActive(s.scenario)
                setProgress(1)
                play()
              }}
              className={`rounded border px-2 py-1 font-display text-xs transition-colors motion-reduce:transition-none ${
                s.scenario === active
                  ? 'border-prism/60 bg-vault-800 text-zinc-100'
                  : 'border-vault-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {s.scenario}
            </button>
          ))}
        </fieldset>
        <p aria-hidden className="font-display text-sm tabular-nums text-zinc-400">
          {formatInt(shownIterations)} draws
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Monte Carlo distribution for the ${data.scenario} scenario: ${formatInt(
          data.iterations ?? 0,
        )} simulated draws. P10 ${usd(data.p10Cents)}, P50 ${usd(data.p50Cents)}, P90 ${usd(
          data.p90Cents,
        )} versus pack price ${usd(priceCents)}.`}
      >
        <title>Monte Carlo outcome distribution</title>
        <defs>
          <linearGradient id="mc-facet" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g transform={`translate(${M.left},${M.top})`}>
          {/* bars — the run itself */}
          {bins.map((bin, i) => {
            const delay = (i / bins.length) * BAR_STAGGER_FRACTION
            const local = clamp01(((progress - delay) * DURATION_MS) / BAR_GROW_MS)
            const grown = easeOutCubic(local)
            const fullH = (bin.count / maxCount) * plotH
            const h = fullH * grown
            const beatsPrice = bin.loCents >= priceCents
            return (
              <rect
                key={bin.loCents}
                x={i * bandW + 1}
                y={plotH - h}
                width={Math.max(0.5, bandW - 2)}
                height={h}
                fill={beatsPrice ? 'url(#mc-facet)' : '#2a1c46'}
              />
            )
          })}

          {/* pack price reference line */}
          {priceX !== null && (
            <g>
              <line x1={priceX} y1={-8} x2={priceX} y2={plotH} stroke="#f2eee3" strokeWidth="1.5" />
              <text
                x={priceX}
                y={-12}
                textAnchor="middle"
                className="fill-slab font-display"
                fontSize="11"
              >
                price {usd(priceCents)}
              </text>
            </g>
          )}

          {/* percentile lines fade in as the run settles */}
          {percentiles.map(({ label, cents }) => {
            if (cents === null) return null
            const x = valueToX(bins, bandW, cents)
            if (x === null) return null
            return (
              <g key={label} opacity={linesVisible ? 1 : 0} style={{ transition: 'opacity 300ms' }}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={plotH}
                  stroke="#a78bfa"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x={x} y={plotH + 24} textAnchor="middle" fill="#a78bfa" fontSize="10">
                  {label}
                </text>
              </g>
            )
          })}

          {/* x-axis edge ticks */}
          <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#2a1c46" strokeWidth="1" />
          {tickIndices.map((i) => {
            const bin = bins[i]
            if (bin === undefined) return null
            const isLast = i === bins.length - 1
            const x = isLast ? bins.length * bandW : i * bandW
            return (
              <text
                key={`${i}-${isLast ? 'hi' : 'lo'}`}
                x={x}
                y={plotH + 12}
                textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
                fill="#71717a"
                fontSize="10"
              >
                {usdCompact(isLast ? bin.hiCents : bin.loCents)}
              </text>
            )
          })}
        </g>
      </svg>

      <p className="mt-2 text-xs text-zinc-500">
        {data.histogramOf === 'ev'
          ? 'Distribution of the simulated pack EV — the reference-prior scenario models no individual pulls.'
          : data.histogramOf === 'pull'
            ? 'Distribution of simulated single-pull values (posterior predictive). Bars at or above the pack price are highlighted.'
            : 'Simulated outcome distribution.'}{' '}
        Log-spaced value bins; dashed lines mark the P10/P50/P90 of the pack-EV credible range.
      </p>
    </div>
  )
}
