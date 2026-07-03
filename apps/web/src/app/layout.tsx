import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'RenaissLens',
  description:
    'Pack expected-value & market intelligence for renaiss.xyz — estimates from public data, every assumption labeled.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <div className="border-b border-vault-700 bg-vault-900 px-4 py-2 text-center text-xs text-zinc-400">
            Estimates from public data. Not financial advice. Not affiliated with Renaiss.
          </div>
          <header className="mx-auto flex max-w-5xl items-baseline gap-3 px-4 pb-2 pt-6">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">RenaissLens</h1>
            <span className="text-sm text-zinc-500">is this pack +EV, or are you donating?</span>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
