import type { Database } from 'better-sqlite3'
import { defaultDbPath, repoRoot, snapshotsRoot } from './paths'

export type { Database }
export * from './types'
export * from './queries'
export { openDb } from './open'
export { runMigrations } from './migrate'
export { defaultDbPath, repoRoot, snapshotsRoot }
