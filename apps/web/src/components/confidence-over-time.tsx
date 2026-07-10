'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usd, usdCompact } from '@/lib/format'
import type { ConfidencePoint } from '@/lib/pack-data'

interface Props {
  points: ConfidencePoint[]
  scenario: string
  priceCents: number
}

const DURATION_MS = 1000
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// SVG geometry (viewBox units)
const W = 720
const H = 260
const M = { top: 24, right: 16, bottom: 34, left: 52 }
const plotW = W - M.left - M.right
const plotH = H - M.top - M.bottom

/** pull count → x (single point centers itself). */
export function pullsToX(pulls: number, minP: number, maxP: number): number {
  if (maxP === minP) return M.left + plotW / 2
  return M.left + ((pulls - minP) / (maxP - minP)) * plotW
}

/** cents → y (inverted: larger dollars are higher on the chart). */
export function centsToY(cents: number, yMin: number, yMax: number): number {
  if (yMax === yMin) return M.top + plotH / 2
  return M.top + (1 - (cents - yMin) / (yMax - yMin)) * plotH
}

/** Aria label whose direction word is derived, never hard-coded. */
export function buildAriaLabel(points: ConfidencePoint[], scenario: string): string {
  if (points.length === 0)
    return `Confidence over time for the ${scenario} scenario: no history yet.`
  const first = points[0] as ConfidencePoint
  const last = points[points.length - 1] as ConfidencePoint
  if (points.length === 1) {
    return `Confidence over time for the ${scenario} scenario: a single EV run at ${first.pulls} observed pulls, P10–P90 range ${usd(first.p10)} to ${usd(first.p90)}.`
  }
  const delta = last.widthCents - first.widthCents
  const dir = delta < 0 ? 'narrowed' : delta > 0 ? 'widened' : 'held steady'
  return `Confidence over time for the ${scenario} scenario: the P10–P90 range ${dir} from ${usd(first.widthCents)} wide at ${first.pulls} observed pulls to ${usd(last.widthCents)} wide at ${last.pulls} pulls.`
}

/**
 * How a pack's EV range (P10–P90) has evolved as observed pulls accumulate. The
 * server render IS the final chart; on load the band sweeps in left→right once,
 * and prefers-reduced-motion never animates. X is observed pulls (capped at
 * 500). A single run shows a lone range with an honest "snapshot, not a trend"
 * note — no line is drawn through one point.
 */
export function ConfidenceOverTime({ points, scenario, priceCents }: Props) {
  const [progress, setProgress] = useState(1) // 1 = final (SSR state)
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

  if (points.length === 0) {
    return (
      <p className="rounded border border-vault-700 bg-vault-900/60 p-4 text-sm text-zinc-400">
        No EV-run history yet — the confidence curve appears once the collector has recomputed the
        range across more than one data state.
      </p>
    )
  }

  const minP = Math.min(...points.map((p) => p.pulls))
  const maxP = Math.max(...points.map((p) => p.pulls))
  const yMin = Math.min(priceCents, ...points.map((p) => p.p10))
  const yMax = Math.max(priceCents, ...points.map((p) => p.p90))

  const first = points[0] as ConfidencePoint
  const last = points[points.length - 1] as ConfidencePoint
  const widthDelta = last.widthCents - first.widthCents
  const dirWord =
    points.length < 2
      ? ''
      : widthDelta < 0
        ? 'narrowed'
        : widthDelta > 0
          ? 'widened'
          : 'held steady'

  const clipW = M.left + plotW * (reducedRef.current ? 1 : progress)
  const priceY = centsToY(priceCents, yMin, yMax)

  // band path: P90 across L→R, then P10 back R→L
  const bandPath =
    points.length >= 2
      ? `${points
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'} ${pullsToX(p.pulls, minP, maxP)} ${centsToY(p.p90, yMin, yMax)}`,
          )
          .join(' ')} ${[...points]
          .reverse()
          .map((p) => `L ${pullsToX(p.pulls, minP, maxP)} ${centsToY(p.p10, yMin, yMax)}`)
          .join(' ')} Z`
      : ''
  const p50Path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${pullsToX(p.pulls, minP, maxP)} ${centsToY(p.p50, yMin, yMax)}`,
    )
    .join(' ')

  return (
    <div className="rounded border border-vault-700 bg-vault-900/60 p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={buildAriaLabel(points, scenario)}
      >
        <title>Confidence over time</title>
        <defs>
          <linearGradient id="conf-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.15" />
          </linearGradient>
          <clipPath id="conf-reveal">
            <rect x={0} y={0} width={clipW} height={H} />
          </clipPath>
        </defs>

        {/* Y ticks: price + the range extremes */}
        {[
          { key: 'min', cents: yMin },
          { key: 'price', cents: priceCents },
          { key: 'max', cents: yMax },
        ].map(({ key, cents }) => (
          <text
            key={key}
            x={M.left - 6}
            y={centsToY(cents, yMin, yMax) + 3}
            textAnchor="end"
            fill="#71717a"
            fontSize="10"
          >
            {usdCompact(cents)}
          </text>
        ))}

        {/* pack price reference line */}
        <line
          x1={M.left}
          y1={priceY}
          x2={W - M.right}
          y2={priceY}
          stroke="#f2eee3"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.5"
        />
        <text x={W - M.right} y={priceY - 4} textAnchor="end" className="fill-slab" fontSize="10">
          price {usd(priceCents)}
        </text>

        <g clipPath="url(#conf-reveal)">
          {points.length >= 2 ? (
            <>
              <path d={bandPath} fill="url(#conf-band)" stroke="none" />
              <path d={p50Path} fill="none" stroke="#a78bfa" strokeWidth="1.75" />
              {points.map((p) => (
                <circle
                  key={p.pulls}
                  cx={pullsToX(p.pulls, minP, maxP)}
                  cy={centsToY(p.p50, yMin, yMax)}
                  r={2.5}
                  fill="#a78bfa"
                />
              ))}
            </>
          ) : (
            // single run: a lone P10–P90 I-bar, no line through one point
            <g>
              <line
                x1={pullsToX(first.pulls, minP, maxP)}
                y1={centsToY(first.p90, yMin, yMax)}
                x2={pullsToX(first.pulls, minP, maxP)}
                y2={centsToY(first.p10, yMin, yMax)}
                stroke="#a78bfa"
                strokeWidth="2"
              />
              <circle
                cx={pullsToX(first.pulls, minP, maxP)}
                cy={centsToY(first.p50, yMin, yMax)}
                r={4}
                fill="#a78bfa"
              />
            </g>
          )}
        </g>

        {/* x axis */}
        <line
          x1={M.left}
          y1={H - M.bottom}
          x2={W - M.right}
          y2={H - M.bottom}
          stroke="#2a1c46"
          strokeWidth="1"
        />
        {[...new Set(minP === maxP ? [minP] : [minP, Math.round((minP + maxP) / 2), maxP])].map(
          (n, i, arr) => (
            <text
              key={n}
              x={pullsToX(n, minP, maxP)}
              y={H - M.bottom + 14}
              textAnchor={
                arr.length === 1
                  ? 'middle'
                  : i === 0
                    ? 'start'
                    : i === arr.length - 1
                      ? 'end'
                      : 'middle'
              }
              fill="#71717a"
              fontSize="10"
            >
              {n} pulls
            </text>
          ),
        )}
        <text
          x={(M.left + W - M.right) / 2}
          y={H - 4}
          textAnchor="middle"
          fill="#52525b"
          fontSize="10"
        >
          observed pulls (capped at 500)
        </text>
      </svg>

      {points.length >= 2 ? (
        <p className="mt-2 text-xs text-zinc-500">
          Shaded band = P10–P90 credible range for the {scenario} scenario; line = P50. One point
          per EV run. The range has {dirWord} to {usd(last.widthCents)} wide over{' '}
          {last.pulls - first.pulls} more observed pulls.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          This is a single EV run — a snapshot, not a trend. The curve appears automatically once
          repeated scrapes accumulate more runs (the collector recomputes whenever fresh pulls
          change the inputs). Current P10–P90 range: {usd(first.p10)}–{usd(first.p90)} (
          {usd(first.widthCents)} wide) at {first.pulls} observed pulls.
        </p>
      )}
    </div>
  )
}
