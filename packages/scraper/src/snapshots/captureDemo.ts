import { cpSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Manifest, readManifest, rootDir } from './store'

/**
 * Curate the committed offline demo set: copy the latest OK snapshot of every
 * source from live/ into demo/ and write demo/manifest.json. Run after a
 * clean `pnpm scrape` cycle; the result is committed to the repo so
 * `pnpm i && pnpm dev` works with zero network and zero env vars.
 */
export function captureDemo(): { captured: string[] } {
  const live = readManifest('live')
  const captured: string[] = []
  const demoManifest: Manifest = { updatedAt: new Date().toISOString(), sources: {} }

  for (const [source, entry] of Object.entries(live.sources)) {
    if (entry.status !== 'ok') continue
    const from = join(rootDir('live'), entry.latest)
    const to = join(rootDir('demo'), entry.latest)
    cpSync(from, to, { recursive: true })
    demoManifest.sources[source] = entry
    captured.push(source)
  }

  const base = rootDir('demo')
  mkdirSync(base, { recursive: true })
  const path = join(base, 'manifest.json')
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(demoManifest, null, 2))
  renameSync(tmp, path)
  return { captured }
}
