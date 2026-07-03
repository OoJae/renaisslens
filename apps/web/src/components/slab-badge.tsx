import { type Verdict, verdictLabel } from '@renaisslens/ev-engine'
import { formatInt } from '@/lib/format'
import { VERDICT_GLYPH_ON_SLAB, VERDICT_INK_ON_SLAB } from '@/lib/verdict-ui'

interface SlabBadgeProps {
  verdict: Verdict
  reason?: string
  size?: 'card' | 'detail'
  /** cert-serial row, detail size only */
  cert?: { seed: number | null; iterations: number | null; ranAt: string }
}

/**
 * The signature element: a grading-slab cert label — bone card-stock on the
 * violet-black vault field, printed rules, brand row, big verdict, serial row.
 * Server component; zero JS.
 */
export function SlabBadge({ verdict, reason, size = 'card', cert }: SlabBadgeProps) {
  const detail = size === 'detail'
  return (
    <div
      className={`overflow-hidden rounded-sm border border-slab-line bg-slab text-vault-950 shadow-sm ${
        detail ? 'w-full max-w-md' : ''
      }`}
    >
      <div className={`bg-gradient-to-r from-prism to-facet ${detail ? 'h-1' : 'h-0.5'}`} />
      <div
        className={`flex items-center justify-between border-b border-slab-line ${
          detail ? 'px-4 py-1.5' : 'px-2.5 py-1'
        }`}
      >
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-vault-950/70">
          RenaissLens · EV Estimate
        </span>
        <span aria-hidden className={`h-2 w-2 ${VERDICT_GLYPH_ON_SLAB[verdict]}`} />
      </div>
      <div className={detail ? 'px-4 pb-3 pt-1.5' : 'px-2.5 pb-1.5 pt-1'}>
        <p
          className={`font-display font-semibold ${VERDICT_INK_ON_SLAB[verdict]} ${
            detail ? 'text-2xl font-bold' : 'text-sm'
          }`}
        >
          <span className="sr-only">Verdict: </span>
          {verdictLabel(verdict)}
        </p>
        {reason !== undefined &&
          (detail ? (
            <p className="mt-0.5 text-[11px] leading-snug text-vault-950/70">{reason}</p>
          ) : (
            <p className="truncate text-[10px] text-vault-950/70" title={reason}>
              {reason}
            </p>
          ))}
      </div>
      {detail && cert !== undefined && (
        <div className="border-t border-slab-line px-4 py-1 text-right font-mono text-[10px] text-vault-950/60">
          {[
            cert.seed !== null ? `SEED ${cert.seed}` : null,
            cert.iterations !== null ? `${formatInt(cert.iterations)} IT` : null,
            cert.ranAt.slice(0, 10),
          ]
            .filter((s): s is string => s !== null)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}
