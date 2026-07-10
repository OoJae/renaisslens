import type { Metadata } from 'next'
import { Fraunces, Instrument_Sans, Space_Grotesk, Space_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// display face: ink-trapped grotesque with tabular figures for prices/EV ranges (dashboard UI)
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

// couture display for the RenaissLens brand — Fraunces: high optical contrast + SOFT/WONK
// (nostalgic-yet-exacting), opsz thickens hairlines so they survive the dark field
const couture = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT', 'WONK'],
  style: ['normal', 'italic'],
  variable: '--font-couture',
})

// cert / proof data — retro label-printer figures; also upgrades all existing font-mono usage
const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'RenaissLens',
  description:
    'Pack expected-value & market intelligence for renaiss.xyz — estimates from public data, every assumption labeled.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${couture.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
