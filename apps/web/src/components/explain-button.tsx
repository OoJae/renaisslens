'use client'

import Link from 'next/link'
import { useState } from 'react'

interface ExplainSuccess {
  explanation: string
  model: string
  ranAt: string
  cached: boolean
  truncated: boolean
}

type ExplainState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ExplainSuccess }
  | { status: 'error'; message: string; retryable: boolean }

/** The canonical caveat with "the Methodology page" turned into a live link. */
function CaveatBlock({ text }: { text: string }) {
  const phrase = 'the Methodology page'
  const at = text.indexOf(phrase)
  return (
    <div className="rounded border border-amber-700/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
      {at === -1 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <Link href="/methodology" className="underline hover:text-amber-200">
            {phrase}
          </Link>
          {text.slice(at + phrase.length)}
        </>
      )}
    </div>
  )
}

/**
 * The AI explainer island. The server page gates rendering on
 * ANTHROPIC_API_KEY being configured, so a keyless demo never shows a dead
 * button — the 503 handling below is defense in depth only.
 */
export function ExplainButton({ slug }: { slug: string }) {
  const [state, setState] = useState<ExplainState>({ status: 'idle' })

  const explain = async () => {
    if (state.status === 'loading') return
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const body = (await res.json().catch(() => null)) as
        | ({ ok: boolean; error?: string } & Partial<ExplainSuccess>)
        | null
      if (res.ok && body?.ok && typeof body.explanation === 'string') {
        setState({
          status: 'success',
          data: {
            explanation: body.explanation,
            model: body.model ?? 'unknown',
            ranAt: body.ranAt ?? '',
            cached: body.cached === true,
            truncated: body.truncated === true,
          },
        })
        return
      }
      if (res.status === 429) {
        setState({
          status: 'error',
          message: 'The explainer is rate-limited — try again in about a minute.',
          retryable: true,
        })
        return
      }
      if (res.status === 503) {
        setState({
          status: 'error',
          message: 'The explainer is not configured on this deployment.',
          retryable: false,
        })
        return
      }
      setState({
        status: 'error',
        message: 'The explainer had a problem — try again shortly.',
        retryable: true,
      })
    } catch {
      setState({
        status: 'error',
        message: 'The explainer had a problem — try again shortly.',
        retryable: true,
      })
    }
  }

  const marker = state.status === 'success' ? state.data.explanation.indexOf('⚠️') : -1
  const prose =
    state.status === 'success'
      ? (marker === -1 ? state.data.explanation : state.data.explanation.slice(0, marker)).trim()
      : ''
  const caveat =
    state.status === 'success' && marker !== -1 ? state.data.explanation.slice(marker).trim() : ''

  return (
    <div>
      {state.status !== 'success' && (
        <button
          type="button"
          onClick={explain}
          disabled={state.status === 'loading'}
          aria-busy={state.status === 'loading'}
          className="rounded border border-prism/60 bg-vault-800 px-3 py-2 font-display text-sm text-zinc-100 transition-colors hover:border-prism disabled:opacity-70 motion-reduce:transition-none"
        >
          {state.status === 'loading'
            ? 'Reading the numbers…'
            : 'Explain this pack’s EV — like a collector, not a quant'}
        </button>
      )}

      {state.status === 'loading' && (
        <div role="status" aria-label="Generating explanation" className="mt-3">
          <div className="h-1 w-48 animate-pulse rounded-full bg-gradient-to-r from-prism/40 to-facet/40 motion-reduce:animate-none" />
        </div>
      )}

      <div aria-live="polite">
        {state.status === 'error' && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-zinc-400">{state.message}</p>
            {state.retryable && (
              <button
                type="button"
                onClick={explain}
                className="rounded border border-vault-700 px-2 py-1 font-display text-xs text-zinc-300 hover:border-prism/50"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {state.status === 'success' && (
          <div className="space-y-3">
            {prose.split('\n\n').map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-zinc-300">
                {paragraph}
              </p>
            ))}
            {caveat && <CaveatBlock text={caveat} />}
            <p className="font-mono text-[11px] text-zinc-500">
              AI-generated · {state.data.model} · data as of {state.data.ranAt}
              {state.data.cached ? ' · cached' : ''}
            </p>
            {state.data.truncated && (
              <button
                type="button"
                onClick={explain}
                className="rounded border border-vault-700 px-2 py-1 font-display text-xs text-zinc-300 hover:border-prism/50"
              >
                Response was trimmed — explain again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
