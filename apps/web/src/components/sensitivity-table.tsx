import type { EvRunRow } from '@renaisslens/db'
import { type Assumption, HEADLINE_SCENARIO, PARAM } from '@renaisslens/ev-engine'
import { usd } from '@/lib/format'

interface SensitivityTableProps {
  /** ordered runs (SCENARIO_ORDER) with their parsed assumptions (null when unparseable) */
  rows: { run: EvRunRow; assumptions: Assumption[] | null }[]
}

const pct = (p: number | null): string => (p === null ? 'not modeled' : `${Math.round(p * 100)}%`)

function numeric(assumptions: Assumption[] | null, name: string): number | null {
  const a = assumptions?.find((x) => x.name === name)
  return a !== undefined && typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : null
}

/** "β=2 · haircut 0.90 · odds 1/3000–1/1000" — the knobs that differ per scenario. */
function keyParams(assumptions: Assumption[] | null): string {
  const holdLo = numeric(assumptions, PARAM.referenceHoldLo)
  const holdHi = numeric(assumptions, PARAM.referenceHoldHi)
  if (holdLo !== null && holdHi !== null) {
    return `hold ${Math.round(holdLo * 100)}–${Math.round(holdHi * 100)}% · ignores pull data`
  }
  const parts: string[] = []
  const beta = numeric(assumptions, PARAM.feedHitBiasFactor)
  if (beta !== null) parts.push(`β=${beta}`)
  const haircut = numeric(assumptions, PARAM.fmvHaircut)
  if (haircut !== null) parts.push(`haircut ${haircut.toFixed(2)}`)
  const lo = numeric(assumptions, PARAM.topPrizeOddsLo)
  const hi = numeric(assumptions, PARAM.topPrizeOddsHi)
  if (lo !== null && hi !== null) {
    parts.push(
      hi > 0 && lo > 0 ? `odds 1/${Math.round(1 / lo)}–1/${Math.round(1 / hi)}` : 'top prize off',
    )
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/**
 * The sensitivity ladder: the same public data under increasingly skeptical
 * assumptions. The gap between rows IS the honest answer.
 */
export function SensitivityTable({ rows }: SensitivityTableProps) {
  return (
    <div className="overflow-x-auto rounded border border-vault-700">
      <table className="w-full text-sm">
        <caption className="sr-only">
          EV percentiles and probability of positive expected value per pool-assumption scenario
        </caption>
        <thead className="bg-vault-900 text-left text-zinc-400">
          <tr>
            <th scope="col" className="px-3 py-2">
              Scenario
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              P10
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              P50
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              P90
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              P(EV &gt; price)
            </th>
            <th scope="col" className="px-3 py-2">
              Key assumptions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ run, assumptions }) => {
            const headline = run.scenario === HEADLINE_SCENARIO
            return (
              <tr
                key={run.scenario}
                className={`border-t border-vault-800 ${headline ? 'bg-vault-800/60' : ''}`}
              >
                <th scope="row" className="px-3 py-2 text-left font-medium text-zinc-200">
                  {run.scenario}
                  {headline && (
                    <span className="ml-2 rounded border border-prism/40 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-prism">
                      headline
                    </span>
                  )}
                </th>
                <td className="px-3 py-2 text-right font-display tabular-nums text-zinc-100">
                  {usd(run.p10_cents)}
                </td>
                <td className="px-3 py-2 text-right font-display font-semibold tabular-nums text-zinc-100">
                  {usd(run.p50_cents)}
                </td>
                <td className="px-3 py-2 text-right font-display tabular-nums text-zinc-100">
                  {usd(run.p90_cents)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                  {pct(run.prob_ev_above_price)}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-400">{keyParams(assumptions)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
