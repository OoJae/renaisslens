import { type Database, listGradedListings, openDb } from '@renaisslens/db'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '../_components/wordmark'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Proof · RenaissProof' }

function readRichestTokenId(): string | null {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    return listGradedListings(db, 1)[0]?.token_id ?? null
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export default function ProofIndex() {
  const tokenId = readRichestTokenId()
  // redirect() throws NEXT_REDIRECT — it must run OUTSIDE the db helper's catch
  if (tokenId !== null) redirect(`/proof/${tokenId}`)
  return (
    <main className="grid min-h-[100svh] place-content-center px-5 text-center">
      <Wordmark className="mx-auto text-lg" />
      <p className="type-lead mt-6 max-w-md text-fog">
        No graded objects under observation yet — run{' '}
        <code className="text-prism">pnpm scrape:mock</code> (offline) or{' '}
        <code className="text-prism">pnpm scrape</code> (live), then reload.
      </p>
      <Link
        href="/studio"
        className="type-cert mt-8 text-bone-50 underline-offset-4 hover:underline"
      >
        ← Back to the house
      </Link>
    </main>
  )
}
