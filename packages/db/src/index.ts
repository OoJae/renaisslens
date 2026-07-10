import type { Database } from 'better-sqlite3'
import { defaultDbPath, repoRoot, snapshotsRoot } from './paths'

export * from './categories'
export { indexMatchKey } from './matchKey'
export { runMigrations } from './migrate'
export { openDb } from './open'
export * from './queries'
export * from './types'
export type { Database }
export { defaultDbPath, repoRoot, snapshotsRoot }
