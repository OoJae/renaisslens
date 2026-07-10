import { ProofSeal } from './proof-seal'

interface SlabPosterProps {
  className?: string
  /** 'raw' = ungraded (blurred/matte, no gold); 'proven' = graded+sealed+authenticated. */
  state?: 'raw' | 'proven'
  /** Real cert data — all optional; defaults reproduce the brand-poster exactly. */
  company?: string
  grade?: string
  /** Pre-truncate long ids before passing (cqw-sized line) — e.g. `CERT · 123456…7890`. */
  serial?: string
  /** Object name — enriches the aria-label only. */
  title?: string
}

/**
 * The graded slab rendered in pure CSS — a holographic card sealed in an acrylic
 * case with a bone cert label. This is the guaranteed LCP element (explicit
 * aspect, no CLS), the prefers-reduced-motion still, and the no-WebGL fallback.
 * `[container-type:inline-size]` + cqw units keep every detail in proportion at
 * any size. Card art is an abstract guilloché — never real IP.
 */
export function SlabPoster({
  className,
  state = 'proven',
  company,
  grade,
  serial,
  title,
}: SlabPosterProps) {
  const proven = state === 'proven'
  const companyText = company ?? 'RenaissProof'
  const gradeText = grade ?? (proven ? 'Gem Mint 10' : 'Ungraded')
  const serialText = serial ?? (proven ? 'CERT · 0000000001' : '— — — — — —')
  const defaultLabel = proven
    ? 'A RenaissProof slab: a holographic card graded Gem Mint 10, sealed in an acrylic case with a cert label and gold seal.'
    : 'An ungraded card, not yet sealed or proven.'
  return (
    <div
      className={`relative aspect-[0.66/1] w-full max-w-[min(80vw,25rem)] [container-type:inline-size] ${className ?? ''}`}
      role="img"
      aria-label={
        title
          ? `${title} — graded ${gradeText} by ${companyText}, sealed in an acrylic case with a cert label.`
          : defaultLabel
      }
    >
      {/* museum spotlight — the one velvet glow */}
      <div className="pointer-events-none absolute -inset-[22%] rounded-full bg-velvet opacity-40 blur-[60px]" />

      {/* acrylic case */}
      <div className="relative h-full w-full overflow-hidden rounded-[7cqw] border border-white/10 bg-vault-800/30 shadow-[0_30cqw_60cqw_-20cqw_rgba(6,4,9,0.9)]">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/[0.14] via-transparent to-black/40" />

        {/* holo authentication strip */}
        <div
          className={`holo-foil h-[1.6cqw] w-full ${proven ? 'opacity-90' : 'opacity-20 saturate-0'}`}
          style={{ mixBlendMode: 'screen' }}
        />

        {/* card window */}
        <div className="relative mx-[6cqw] mt-[5cqw] aspect-[0.74/1] overflow-hidden rounded-[3cqw] border border-white/10 bg-vault-950">
          <div
            className={`holo-foil absolute inset-0 ${proven ? 'opacity-75' : 'opacity-10 saturate-0'}`}
            style={{ mixBlendMode: proven ? 'screen' : 'normal' }}
          />
          {/* abstract guilloché emblem */}
          <svg
            viewBox="0 0 100 135"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full"
            aria-hidden
            style={{ opacity: proven ? 0.55 : 0.15 }}
          >
            <title>emblem</title>
            {[26, 20, 14, 8].map((r, i) => (
              <polygon
                key={r}
                points={hex(50, 62, r, r * 1.32)}
                fill="none"
                stroke={i % 2 === 0 ? '#a78bfa' : '#67e8f9'}
                strokeWidth="0.5"
                opacity={0.8 - i * 0.15}
              />
            ))}
            <path
              d="M50,28 L50,96 M24,47 L76,77 M76,47 L24,77"
              stroke="#a78bfa"
              strokeWidth="0.4"
              opacity="0.5"
            />
          </svg>
          {!proven && <div className="absolute inset-0 bg-vault-950/40 backdrop-grayscale" />}
        </div>

        {/* cert label — bone card-stock */}
        <div className="absolute inset-x-[6cqw] bottom-[4.5cqw] rounded-[3cqw] bg-slab px-[5cqw] py-[3.5cqw] text-plaque">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p
                className="break-words text-[3cqw] font-bold uppercase leading-none tracking-[0.16em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {companyText}
              </p>
              <p
                className="mt-[2.5cqw] break-words text-[6.4cqw] font-bold uppercase leading-none"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {gradeText}
              </p>
              <p
                className="mt-[2cqw] break-all text-[3cqw] leading-none text-plaque/70"
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
              >
                {serialText}
              </p>
            </div>
            <ProofSeal size={44} ignited={proven} className="w-[22cqw] shrink-0" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** points for a hexagon centered (cx,cy) with horizontal radius rx and vertical ry */
function hex(cx: number, cy: number, rx: number, ry: number): string {
  return [
    [cx, cy - ry],
    [cx + rx, cy - ry / 2],
    [cx + rx, cy + ry / 2],
    [cx, cy + ry],
    [cx - rx, cy + ry / 2],
    [cx - rx, cy - ry / 2],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
}
