import { usd } from '@/lib/format'

interface Props {
  packName: string
  priceCents: number
  /** Renaiss's single claimed EV — shown for contrast, never used to compute anything. */
  claimedEvCents: number | null
  /** Empirical mean realized pull FMV + seeded 95% bootstrap CI. */
  observedMean: { mean: number; lo: number; hi: number } | null
}

// SVG geometry
const W = 720
const H = 96
const AXIS_Y = 54
const M = { left: 16, right: 16 }
const plotW = W - M.left - M.right

/**
 * A one-line reconciliation: pack price, Renaiss's single claimed EV, and the
 * mean realized FMV of the pulls we actually observed (with its 95% CI). This is
 * a scalar reconciliation — the only honest "claimed vs observed" available,
 * because Renaiss publishes no per-tier odds. Both EV figures rest on Renaiss's
 * own FMV valuations, so it is NOT an independent price check. Server component,
 * zero JS.
 */
export function EvReconciliation({ packName, priceCents, claimedEvCents, observedMean }: Props) {
  // Domain spans the pack-scale dollars only — deliberately NOT the featured-card
  // FMV, which is orders of magnitude larger and would flatten everything.
  const holdLo = priceCents * 0.6 // price × (1 − 0.40)
  const holdHi = priceCents * 0.9 // price × (1 − 0.10)
  const marks = [priceCents, holdLo, holdHi]
  if (claimedEvCents !== null) marks.push(claimedEvCents)
  if (observedMean !== null) marks.push(observedMean.lo, observedMean.hi, observedMean.mean)
  const rawMin = Math.min(...marks)
  const rawMax = Math.max(...marks)
  const pad = (rawMax - rawMin) * 0.08 || rawMax * 0.08 || 1
  const domMin = rawMin - pad
  const domMax = rawMax + pad
  const xAt = (cents: number) => M.left + ((cents - domMin) / (domMax - domMin)) * plotW

  const ariaParts = [
    `pack price ${usd(priceCents)}`,
    claimedEvCents !== null ? `Renaiss claims ${usd(claimedEvCents)}` : 'Renaiss publishes no EV',
    observedMean !== null
      ? `observed mean realized FMV ${usd(Math.round(observedMean.mean))} (95% CI ${usd(
          Math.round(observedMean.lo),
        )}–${usd(Math.round(observedMean.hi))})`
      : 'no observed pulls',
  ]

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${packName} claim-versus-observed reconciliation: ${ariaParts.join('; ')}.`}
      >
        <title>{`Claimed EV vs. observed realized value, ${packName}`}</title>

        {/* reference-prior house-edge band: price × (1 − hold), hold ∈ [10%, 40%] */}
        <rect
          x={xAt(holdLo)}
          y={AXIS_Y - 16}
          width={Math.max(0, xAt(holdHi) - xAt(holdLo))}
          height={32}
          fill="#67e8f9"
          opacity="0.06"
        />

        {/* axis */}
        <line
          x1={M.left}
          y1={AXIS_Y}
          x2={W - M.right}
          y2={AXIS_Y}
          stroke="#2a1c46"
          strokeWidth="1"
        />

        {/* pack price — bone reference line */}
        <line
          x1={xAt(priceCents)}
          y1={AXIS_Y - 22}
          x2={xAt(priceCents)}
          y2={AXIS_Y + 22}
          stroke="#f2eee3"
          strokeWidth="1.5"
        />
        <text
          x={xAt(priceCents)}
          y={AXIS_Y - 27}
          textAnchor="middle"
          className="fill-slab font-display"
          fontSize="11"
        >
          price {usd(priceCents)}
        </text>

        {/* observed mean + CI whisker (emerald) */}
        {observedMean !== null && (
          <g>
            <line
              x1={xAt(observedMean.lo)}
              y1={AXIS_Y}
              x2={xAt(observedMean.hi)}
              y2={AXIS_Y}
              stroke="#34d399"
              strokeWidth="2"
            />
            <line
              x1={xAt(observedMean.lo)}
              y1={AXIS_Y - 5}
              x2={xAt(observedMean.lo)}
              y2={AXIS_Y + 5}
              stroke="#34d399"
              strokeWidth="2"
            />
            <line
              x1={xAt(observedMean.hi)}
              y1={AXIS_Y - 5}
              x2={xAt(observedMean.hi)}
              y2={AXIS_Y + 5}
              stroke="#34d399"
              strokeWidth="2"
            />
            <circle cx={xAt(observedMean.mean)} cy={AXIS_Y} r={4} fill="#34d399" />
            <text
              x={xAt(observedMean.mean)}
              y={AXIS_Y + 20}
              textAnchor="middle"
              fill="#34d399"
              fontSize="10.5"
            >
              observed {usd(Math.round(observedMean.mean))}
            </text>
          </g>
        )}

        {/* Renaiss claimed EV (amber dot) */}
        {claimedEvCents !== null && (
          <g>
            <circle cx={xAt(claimedEvCents)} cy={AXIS_Y} r={4} fill="#fbbf24" />
            <text
              x={xAt(claimedEvCents)}
              y={AXIS_Y + 34}
              textAnchor="middle"
              fill="#fbbf24"
              fontSize="10.5"
            >
              Renaiss claims {usd(claimedEvCents)}
            </text>
          </g>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>
          <span
            aria-hidden
            className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle"
          />
          observed mean realized FMV{observedMean !== null ? '' : ' — none yet'}
        </span>
        <span>
          <span
            aria-hidden
            className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle"
          />
          Renaiss claimed EV (never used in our model)
        </span>
        <span>
          <span aria-hidden className="mr-1 inline-block h-2 w-3 bg-facet/10 align-middle" />
          reference-class house-edge band
        </span>
      </div>
    </div>
  )
}
