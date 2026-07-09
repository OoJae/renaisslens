'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** One tier's observed frequency + its Wilson 95% interval (plain, serializable). */
export interface TierFrequencyView {
  tier: string
  n: number
  point: number
  lo: number
  hi: number
}

interface Props {
  packName: string
  tiers: TierFrequencyView[]
}

const DURATION_MS = 900
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`

// SVG geometry (viewBox units)
const W = 720
const ROW_H = 40
const PAD_TOP = 10
const PAD_BOTTOM = 26
const LABEL_W = 84 // tier name column (left)
const VALUE_W = 132 // "80% · n=48" column (right)
const plotX0 = LABEL_W
const plotW = W - LABEL_W - VALUE_W

function describe(packName: string, tiers: TierFrequencyView[]): string {
  const parts = tiers.map(
    (t) => `${t.tier} ${pct(t.point)} (95% CI ${pct(t.lo)}–${pct(t.hi)}, n=${t.n})`,
  )
  return `${packName} observed tier frequencies: ${parts.join('; ')}.`
}

/**
 * Empirical pull frequency by tier with a Wilson 95% interval per tier. The
 * server render IS the final chart (no-JS sees complete bars); on load the bars
 * sweep out left→right once, and prefers-reduced-motion never animates. These
 * are frequencies in the OBSERVED feed — not Renaiss's true odds.
 */
export function TierDistributionChart({ packName, tiers }: Props) {
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

  if (tiers.length === 0) {
    return <p className="text-xs text-zinc-500">No tier data yet.</p>
  }

  const H = PAD_TOP + tiers.length * ROW_H + PAD_BOTTOM
  const grow = easeOutCubic(progress)
  const xAt = (p: number) => plotX0 + clamp01(p) * plotW

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={describe(packName, tiers)}
      >
        <title>{`Observed tier frequency, ${packName}`}</title>
        <defs>
          <linearGradient id="tier-facet" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* gridlines at 0 / 50 / 100% */}
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line
              x1={xAt(g)}
              y1={PAD_TOP}
              x2={xAt(g)}
              y2={H - PAD_BOTTOM}
              stroke="#2a1c46"
              strokeWidth="1"
            />
            <text
              x={xAt(g)}
              y={H - PAD_BOTTOM + 14}
              textAnchor="middle"
              fill="#71717a"
              fontSize="10"
            >
              {pct(g)}
            </text>
          </g>
        ))}

        {tiers.map((t, i) => {
          const cy = PAD_TOP + i * ROW_H + ROW_H / 2
          const barW = t.point * plotW * grow
          const loX = xAt(t.lo * grow)
          const hiX = xAt(t.hi * grow)
          return (
            <g key={t.tier}>
              {/* track */}
              <rect x={plotX0} y={cy - 7} width={plotW} height={14} rx={2} fill="#1c1230" />
              {/* observed-proportion bar */}
              <rect
                x={plotX0}
                y={cy - 7}
                width={Math.max(0, barW)}
                height={14}
                rx={2}
                fill="url(#tier-facet)"
              />
              {/* 95% Wilson whisker */}
              <line x1={loX} y1={cy} x2={hiX} y2={cy} stroke="#f2eee3" strokeWidth="1.5" />
              <line x1={loX} y1={cy - 4} x2={loX} y2={cy + 4} stroke="#f2eee3" strokeWidth="1.5" />
              <line x1={hiX} y1={cy - 4} x2={hiX} y2={cy + 4} stroke="#f2eee3" strokeWidth="1.5" />
              {/* tier label (left) */}
              <text
                x={LABEL_W - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-prism font-display"
                fontSize="13"
              >
                {t.tier}
              </text>
              {/* value label (right) */}
              <text
                x={W - VALUE_W + 8}
                y={cy}
                dominantBaseline="middle"
                fill="#a1a1aa"
                fontSize="11"
                className="tabular-nums"
              >
                {pct(t.point)} · n={t.n}
              </text>
            </g>
          )
        })}
      </svg>

      {/* screen-reader companion: the numbers, not just the picture */}
      <table className="sr-only">
        <caption>Observed pull frequency by tier for {packName}, with 95% Wilson intervals</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">n</th>
            <th scope="col">Observed share</th>
            <th scope="col">95% CI</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.tier}>
              <td>{t.tier}</td>
              <td>{t.n}</td>
              <td>{pct(t.point)}</td>
              <td>
                {pct(t.lo)}–{pct(t.hi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
