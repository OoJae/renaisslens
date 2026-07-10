import type { Metadata } from 'next'
import Link from 'next/link'
import { ProofSeal } from '../_components/proof-seal'
import { SlabCanvas } from '../_components/slab-canvas.client'
import { Wordmark } from '../_components/wordmark'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'RenaissProof — a house of provable provenance',
  description:
    'A gacha pull is luck. We grade it, seal it, and give it a cert number, a hash, and a provenance chain — so what you own is an object you can prove, not a promise you have to trust.',
}

type Section = {
  num: string
  label: string
  title: string
  body: string
  cta?: { href: string; text: string }
}

const SECTIONS: Section[] = [
  {
    num: '01',
    label: 'The Grade',
    title: 'The grade is the truth of the card.',
    body: 'An independent grade fixes condition on the record — centering, corners, edges, surface. It is the number the market actually pays for.',
  },
  {
    num: '02',
    label: 'The Seal',
    title: 'Sealed, so it stays what it is.',
    body: 'Once it is graded, it is sealed in a tamper-evident case. Break the seal and the proof breaks with it — that is the point.',
  },
  {
    num: '03',
    label: 'The Proof',
    title: 'Proof you can check yourself.',
    body: 'Every object carries a cert number and a hash tied to its record. You do not take our word for it — you verify it.',
    cta: { href: '/methodology', text: 'Read the standard' },
  },
  {
    num: '04',
    label: 'The Vault',
    title: 'Your collection, on the record.',
    body: 'The vault holds every object you own with its full provenance — grade, seal, cert, and every hand it has passed through.',
    cta: { href: '/', text: 'Enter the vault' },
  },
  {
    num: '05',
    label: 'The Market',
    title: 'Pull here. Leave with proof.',
    body: 'The market runs on renaiss.xyz — provably-fair gacha and graded listings. Whatever you pull, you leave with a sealed, provable object.',
    cta: { href: '/market', text: 'Open the market' },
  },
]

export default function Studio() {
  return (
    <div id="main" className="relative">
      {/* the pinned slab that authenticates on scroll (fixed layer, behind content) */}
      <SlabCanvas />

      {/* ── nav ── */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-ink via-ink/70 to-transparent px-5 py-5 sm:px-10">
        <Link href="/studio" aria-label="RenaissProof home">
          <Wordmark className="text-base sm:text-lg" />
        </Link>
        <nav
          aria-label="Primary"
          className="type-eyebrow flex items-center gap-4 text-fog sm:gap-7"
        >
          <Link href="#proof" className="hidden transition-colors hover:text-bone-50 sm:inline">
            Proof
          </Link>
          <Link href="#vault" className="hidden transition-colors hover:text-bone-50 sm:inline">
            Vault
          </Link>
          <Link href="#market" className="hidden transition-colors hover:text-bone-50 sm:inline">
            Market
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-vault-700 bg-vault-900/60 px-3 py-1.5 text-bone-50 transition-colors hover:border-seal/50"
          >
            Enter <ProofSeal size={14} className="translate-y-[0.5px]" />
          </Link>
        </nav>
      </header>

      {/* ── 00 · THE HOUSE (hero) ── the slab lives in the fixed canvas to the left ── */}
      <section
        id="hero"
        aria-labelledby="hero-title"
        className="relative z-10 mx-auto grid min-h-[100svh] max-w-[1600px] grid-cols-12 content-end gap-y-16 px-5 pb-16 pt-[56svh] sm:px-10 lg:content-center lg:gap-x-6 lg:pb-24 lg:pt-28"
      >
        {/* cert serial rail */}
        <span
          aria-hidden
          className="type-num absolute left-5 top-32 hidden text-fog sm:left-10 lg:block"
        >
          00 · The House
        </span>

        {/* the plaque channel (cols 8–12); cols 1–7 hold the fixed slab */}
        <div className="col-span-12 lg:col-span-5 lg:col-start-8">
          <p className="type-eyebrow">Provable provenance · over renaiss.xyz</p>
          <h1 id="hero-title" className="type-hero mt-5 text-balance">
            The gamble comes back <span className="holo-text">proven</span>.
          </h1>
          <p className="type-lead mt-7 max-w-md text-fog">
            A gacha pull is luck. We grade it, seal it, and give it a cert number, a hash, and a
            provenance chain — so what you own is an object you can prove, not a promise you have to
            trust.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-full bg-slab px-5 py-3 font-display text-sm font-medium text-plaque transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
            >
              Enter the vault
              <ProofSeal
                size={18}
                className="transition-transform group-hover:rotate-[30deg] motion-reduce:transform-none"
              />
            </Link>
            <Link
              href="/packs/omega"
              className="type-cert inline-flex items-center gap-2 rounded-full border border-vault-700 px-5 py-3 text-bone-50 transition-colors hover:border-prism/50"
            >
              See a live proof
            </Link>
          </div>
          <p className="type-cert mt-16 text-fog lg:mt-24">Scroll to authenticate ↓</p>
        </div>
      </section>

      {/* ── 01–05 · the sequence ── */}
      {SECTIONS.map((s) => {
        const anchor =
          s.label === 'The Proof'
            ? 'proof'
            : s.label === 'The Vault'
              ? 'vault'
              : s.label === 'The Market'
                ? 'market'
                : undefined
        return (
          <section
            id={anchor}
            key={s.num}
            aria-labelledby={`sec-${s.num}`}
            className="relative z-10 mx-auto grid max-w-[1600px] grid-cols-12 items-baseline gap-y-4 border-t border-vault-800/60 bg-ink px-5 py-20 sm:px-10 lg:py-28"
          >
            <div className="col-span-12 lg:col-span-3">
              <p className="type-num">{s.num}</p>
              <p className="type-eyebrow mt-2 text-prism/80">{s.label}</p>
            </div>
            <div className="col-span-12 lg:col-span-8 lg:col-start-5">
              <h2 id={`sec-${s.num}`} className="type-section max-w-2xl text-balance">
                {s.title}
              </h2>
              <div aria-hidden className="auth-line mt-6 max-w-[8rem]" data-in="true" />
              <p className="type-lead mt-6 max-w-xl text-fog">{s.body}</p>
              {s.cta && (
                <Link
                  href={s.cta.href}
                  className="type-cert mt-8 inline-flex items-center gap-2 text-bone-50 transition-colors hover:text-prism"
                >
                  {s.cta.text} <span aria-hidden>→</span>
                </Link>
              )}
            </div>
          </section>
        )
      })}

      {/* ── The Standard (colophon) ── */}
      <footer className="relative z-10 mx-auto max-w-[1600px] border-t border-vault-800/60 bg-ink px-5 py-16 sm:px-10">
        <div className="grid grid-cols-12 gap-y-6">
          <div className="col-span-12 lg:col-span-3">
            <p className="type-eyebrow text-fog">The Standard</p>
          </div>
          <div className="col-span-12 lg:col-span-8 lg:col-start-5">
            <p className="type-cert max-w-2xl leading-relaxed text-fog">
              Every claim here is checkable. Grades are independent, seals are tamper-evident,
              proofs are public. Estimates are labeled as estimates.{' '}
              <Link href="/methodology" className="text-bone-50 underline-offset-4 hover:underline">
                Read the standard
              </Link>
              . Not affiliated with Renaiss.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Wordmark className="text-sm" />
              <span className="type-cert text-fog">· a house of provable provenance</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
