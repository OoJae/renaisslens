import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/**
 * Walk up from process.cwd() until we find pnpm-workspace.yaml (the repo root).
 * cwd-based (not import.meta.url) so it works identically under tsx CLIs,
 * vitest, and Next.js/webpack-transpiled server code.
 */
export function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`repoRoot: pnpm-workspace.yaml not found walking up from ${process.cwd()}`)
}

export function defaultDbPath(): string {
  const override = process.env.RENAISSLENS_DB_PATH
  if (override && override.length > 0) {
    // resolve relative overrides against the repo root, not process.cwd() —
    // otherwise the scraper (cwd packages/scraper) and web (cwd apps/web)
    // would silently split onto two different DB files
    return isAbsolute(override) ? override : resolve(repoRoot(), override)
  }
  return join(repoRoot(), 'data', 'renaisslens.db')
}

export function snapshotsRoot(): string {
  return join(repoRoot(), 'data', 'snapshots')
}

export function ensureDirFor(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}
