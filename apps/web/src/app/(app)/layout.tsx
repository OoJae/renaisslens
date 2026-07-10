import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The dashboard chrome — disclaimer banner + primary nav + centered column.
 * Lives in the (app) route group so the immersive brand routes can opt out of it
 * while sharing the one root <html>/<body>/font layout. URLs are unchanged.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-vault-700 bg-vault-900 px-4 py-2 text-center text-xs text-zinc-400">
        Estimates from public data. Not financial advice. Not affiliated with Renaiss.
      </div>
      <header className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-2 pt-6">
        <h1 className="font-display text-xl font-semibold tracking-tight text-zinc-50">
          <Link href="/">RenaissLens</Link>
        </h1>
        <span className="text-sm text-zinc-500">is this pack +EV, or are you donating?</span>
        <nav
          aria-label="Primary"
          className="ml-auto flex flex-wrap items-baseline gap-4 font-display text-sm text-zinc-400"
        >
          <Link href="/" className="hover:text-zinc-100">
            Packs
          </Link>
          <Link href="/market" className="hover:text-zinc-100">
            Market
          </Link>
          <Link href="/methodology" className="hover:text-zinc-100">
            Methodology
          </Link>
          <Link href="/fairness" className="hover:text-zinc-100">
            Fairness
          </Link>
          <Link href="/studio" className="text-prism hover:text-zinc-100">
            RenaissProof ↗
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
