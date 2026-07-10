import Link from 'next/link'
import { ProofSeal } from './proof-seal'
import { Wordmark } from './wordmark'

/**
 * Shared fixed header for the brand pages beyond the landing (/proof, /vault,
 * /standard). Same structural grammar as the studio header so the shell feels
 * continuous; the wordmark leads home to /studio.
 */
export function CertHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-ink via-ink/70 to-transparent px-5 py-5 sm:px-10">
      <Link href="/studio" aria-label="RenaissProof home">
        <Wordmark className="text-base sm:text-lg" />
      </Link>
      <nav aria-label="Primary" className="type-eyebrow flex items-center gap-4 text-fog sm:gap-7">
        <Link href="/vault" className="hidden transition-colors hover:text-bone-50 sm:inline">
          Vault
        </Link>
        <Link href="/standard" className="hidden transition-colors hover:text-bone-50 sm:inline">
          Standard
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-vault-700 bg-vault-900/60 px-3 py-1.5 text-bone-50 transition-colors hover:border-seal/50"
        >
          Enter <ProofSeal size={14} className="translate-y-[0.5px]" />
        </Link>
      </nav>
    </header>
  )
}
