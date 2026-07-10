import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from '@renaisslens/db'
import { marked } from 'marked'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CertHeader } from '../_components/cert-header'
import { Wordmark } from '../_components/wordmark'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Standard · RenaissLens',
  description:
    'What we collect, what we assume, and what we cannot know — the single source of truth behind every number in the house.',
}

function readStandard(): string | null {
  try {
    return readFileSync(join(repoRoot(), 'METHODOLOGY.md'), 'utf8')
  } catch {
    return null // deploy image must ship METHODOLOGY.md alongside the app
  }
}

type StandardSection = { num: string; title: string; html: string }

/**
 * Split the raw markdown on h2 boundaries BEFORE marked runs, so each section
 * heading is rendered by us (Fraunces, cert-numbered) rather than by marked.
 * Assumption (verified): METHODOLOGY.md uses only #/## headings and contains
 * no fenced code blocks, so `\n(?=## )` can never fire inside code.
 */
function splitSections(markdown: string): { leadHtml: string; sections: StandardSection[] } {
  const parts = markdown.split(/\n(?=## )/)
  const intro = (parts[0] ?? '').replace(/^# .*\r?\n/, '')
  const sections = parts.slice(1).map((part, i) => {
    const m = part.match(/^## (.+)\r?\n?/)
    return {
      num: String(i + 1).padStart(2, '0'),
      title: m?.[1] ?? 'Untitled',
      html: marked.parse(part.slice(m?.[0].length ?? 0), { async: false }),
    }
  })
  return { leadHtml: marked.parse(intro, { async: false }), sections }
}

export default function Standard() {
  const markdown = readStandard()
  if (markdown === null) {
    return (
      <main className="grid min-h-[100svh] place-content-center px-5 text-center">
        <Wordmark className="mx-auto text-lg" />
        <p className="type-lead mt-6 max-w-md text-fog">
          METHODOLOGY.md is missing from this deployment — read it in the{' '}
          <a
            className="text-bone-50 underline underline-offset-4"
            href="https://github.com/OoJae/renaisslens/blob/main/METHODOLOGY.md"
          >
            repository
          </a>
          .
        </p>
      </main>
    )
  }

  const { leadHtml, sections } = splitSections(markdown)

  return (
    <div id="main">
      <CertHeader />

      {/* ── hero ── */}
      <section
        aria-labelledby="standard-title"
        className="mx-auto max-w-[1600px] px-5 pb-10 pt-28 sm:px-10 lg:pb-14 lg:pt-36"
      >
        <p className="type-eyebrow">The fine print, in display type</p>
        <h1 id="standard-title" className="type-hero mt-4 text-balance">
          The Standard
        </h1>
        <div aria-hidden className="auth-line mt-6 max-w-[8rem]" data-in="true" />
        <div
          className="standard-prose mt-6"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: repo-owned trusted markdown (METHODOLOGY.md, no user input)
          dangerouslySetInnerHTML={{ __html: leadHtml }}
        />
      </section>

      {/* ── the articles ── */}
      {sections.map((s) => (
        <section
          key={s.num}
          aria-labelledby={`std-${s.num}`}
          className="mx-auto grid max-w-[1600px] grid-cols-12 gap-y-4 border-t border-vault-800/60 px-5 py-12 sm:px-10 lg:py-16"
        >
          <div className="col-span-12 lg:col-span-3">
            <p className="type-num">{s.num}</p>
          </div>
          <div className="col-span-12 min-w-0 lg:col-span-8 lg:col-start-5">
            <h2 id={`std-${s.num}`} className="type-section max-w-2xl text-balance">
              {s.title}
            </h2>
            <div aria-hidden className="auth-line mt-6 max-w-[8rem]" data-in="true" />
            <div
              className="standard-prose mt-6"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: repo-owned trusted markdown (METHODOLOGY.md, no user input)
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          </div>
        </section>
      ))}

      {/* ── colophon ── */}
      <footer className="mx-auto max-w-[1600px] border-t border-vault-800/60 px-5 py-14 sm:px-10 lg:py-20">
        <div className="grid grid-cols-12 gap-y-4">
          <div className="col-span-12 lg:col-span-3">
            <p className="type-eyebrow text-fog">Colophon</p>
          </div>
          <div className="col-span-12 lg:col-span-8 lg:col-start-5">
            <p className="type-cert max-w-2xl leading-relaxed text-fog">
              This page renders the same METHODOLOGY.md the dashboard serves at{' '}
              <Link href="/methodology" className="text-bone-50 underline-offset-4 hover:underline">
                /methodology
              </Link>{' '}
              — one source of truth, two typefaces. See the objects it governs in{' '}
              <Link href="/vault" className="text-bone-50 underline-offset-4 hover:underline">
                the vault
              </Link>{' '}
              or inspect{' '}
              <Link href="/proof" className="text-bone-50 underline-offset-4 hover:underline">
                a live certificate
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
