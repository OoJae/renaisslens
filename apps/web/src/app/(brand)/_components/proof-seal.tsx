interface ProofSealProps {
  size?: number
  /** ignited = struck gold foil (proven). dormant = embossed violet-gray (before proof). */
  ignited?: boolean
  className?: string
}

/**
 * The proof seal — a notary/coin stamp: micro-text ring, struck-foil field, an
 * embossed hexagonal facet (the "graded gem"). Gold is EARNED: dormant until an
 * object authenticates, then ignited. The RenaissLens mark.
 */
export function ProofSeal({ size = 96, ignited = true, className }: ProofSealProps) {
  const foilHi = ignited ? '#efd08a' : '#4a3f66'
  const foilMid = ignited ? '#c8a24a' : '#332a4d'
  const foilLo = ignited ? '#8a6a2f' : '#241b38'
  const ring = ignited ? '#c8a24a' : '#4a3f66'
  const micro = ignited ? '#efd08a' : '#8a7fa6'
  const uid = ignited ? 'on' : 'off'
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={ignited ? 'RenaissLens — verified seal' : 'RenaissLens seal'}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <defs>
        <radialGradient id={`seal-foil-${uid}`} cx="35%" cy="30%">
          <stop offset="0%" stopColor={foilHi} />
          <stop offset="48%" stopColor={foilMid} />
          <stop offset="100%" stopColor={foilLo} />
        </radialGradient>
        <path
          id={`seal-ring-${uid}`}
          d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0"
          fill="none"
        />
      </defs>

      {/* micro-text ring */}
      <circle cx="50" cy="50" r="47" fill="none" stroke={ring} strokeWidth="0.4" opacity="0.7" />
      <circle cx="50" cy="50" r="37" fill="none" stroke={ring} strokeWidth="0.4" opacity="0.5" />
      <text fontSize="4.1" fill={micro} letterSpacing="1.6">
        <textPath href={`#seal-ring-${uid}`} startOffset="0">
          · RENAISSLENS · PROVABLE PROVENANCE · RENAISSLENS · PROVABLE PROVENANCE
        </textPath>
      </text>

      {/* struck foil field */}
      <circle cx="50" cy="50" r="33" fill={`url(#seal-foil-${uid})`} />
      <circle cx="50" cy="50" r="33" fill="none" stroke={foilHi} strokeWidth="0.6" opacity="0.55" />

      {/* embossed hexagonal facet — the graded gem */}
      <g transform="translate(0.7,0.7)" opacity="0.85">
        <polygon
          points="50,30 66,40 66,60 50,70 34,60 34,40"
          fill="none"
          stroke={foilLo}
          strokeWidth="1.5"
        />
      </g>
      <polygon
        points="50,30 66,40 66,60 50,70 34,60 34,40"
        fill="none"
        stroke={foilHi}
        strokeWidth="1.2"
      />
      <path
        d="M50,30 L50,70 M34,40 L66,60 M66,40 L34,60"
        stroke={ring}
        strokeWidth="0.55"
        opacity="0.6"
      />
      <circle cx="50" cy="50" r="3.2" fill={foilHi} opacity="0.9" />
    </svg>
  )
}
