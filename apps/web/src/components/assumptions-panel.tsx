import type { Assumption, Confidence } from '@renaisslens/ev-engine'

const CONFIDENCE_ORDER: Confidence[] = ['observed', 'inferred', 'assumed']

const CONFIDENCE_CHIP: Record<Confidence, string> = {
  observed: 'border-emerald-700/40 bg-emerald-950/40 text-emerald-300',
  inferred: 'border-sky-700/40 bg-sky-950/40 text-sky-300',
  assumed: 'border-amber-700/40 bg-amber-950/40 text-amber-300',
}

const CONFIDENCE_BLURB: Record<Confidence, string> = {
  observed: 'scraped from public data — every value traces to a raw snapshot',
  inferred: 'derived from observed data; the derivation is stated',
  assumed: 'a modeling choice we cannot verify — sweep it, label it, show it',
}

/**
 * Every input the model ran on, grouped by confidence. This panel is the
 * answer to "how do you know?" — when we don't, the label says so.
 */
export function AssumptionsPanel({ assumptions }: { assumptions: Assumption[] }) {
  return (
    <div className="space-y-4">
      {CONFIDENCE_ORDER.map((confidence) => {
        const group = assumptions.filter((a) => a.confidence === confidence)
        if (group.length === 0) return null
        return (
          <div key={confidence} className="rounded border border-vault-700">
            <div className="flex items-baseline gap-2 border-b border-vault-800 bg-vault-900 px-3 py-2">
              <span
                className={`rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] ${CONFIDENCE_CHIP[confidence]}`}
              >
                {confidence}
              </span>
              <span className="text-xs text-zinc-500">{CONFIDENCE_BLURB[confidence]}</span>
            </div>
            <ul className="divide-y divide-vault-800">
              {group.map((a) => (
                <li key={a.name} className="grid gap-1 px-3 py-2 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="break-words font-mono text-xs text-zinc-300">{a.name}</p>
                    <p className="mt-0.5 break-words text-xs leading-snug text-zinc-500">
                      {a.source}
                    </p>
                  </div>
                  <p className="break-all font-display text-sm tabular-nums text-zinc-100 sm:text-right">
                    {a.value}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
