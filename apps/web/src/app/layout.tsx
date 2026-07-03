import type { Metadata } from 'next'
import { Instrument_Sans, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

// display face: ink-trapped grotesque with tabular figures for prices/EV ranges
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})

// quiet body face (deliberately not Inter)
const body = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'RenaissLens',
  description:
    'Pack expected-value & market intelligence for renaiss.xyz — estimates from public data, every assumption labeled.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
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
              <Link href="/fairness" className="flex items-baseline gap-1 hover:text-zinc-100">
                Fairness
                <span className="rounded border border-vault-700 px-1 py-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                  soon
                </span>
              </Link>
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
