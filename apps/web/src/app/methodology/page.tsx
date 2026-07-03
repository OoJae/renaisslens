import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from '@renaisslens/db'
import { marked } from 'marked'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Methodology · RenaissLens' }

function readMethodology(): string | null {
  try {
    return readFileSync(join(repoRoot(), 'METHODOLOGY.md'), 'utf8')
  } catch {
    return null // deploy image must ship METHODOLOGY.md alongside the app
  }
}

export default function Methodology() {
  const markdown = readMethodology()
  if (markdown === null) {
    return (
      <p className="text-zinc-400">
        METHODOLOGY.md is missing from this deployment — read it in the{' '}
        <a
          className="text-prism underline"
          href="https://github.com/olamiye/renaisslens/blob/main/METHODOLOGY.md"
        >
          repository
        </a>
        .
      </p>
    )
  }
  // Trusted content: METHODOLOGY.md is our own repo-committed file, rendered
  // verbatim — no user input flows into it, so no sanitizer is needed here.
  const html = marked.parse(markdown, { async: false })
  return (
    <article
      className="methodology"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: repo-owned trusted markdown (see comment above)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
