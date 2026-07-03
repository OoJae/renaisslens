import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Database } from 'better-sqlite3'
import { openDb } from './open'
import { repoRoot } from './paths'

// lazy + cwd-based (never import.meta.url): safe under webpack transpilation
const migrationsDir = () => join(repoRoot(), 'packages', 'db', 'migrations')

/** Apply all migrations above the db's current PRAGMA user_version. Idempotent. */
export function runMigrations(db: Database): { applied: string[] } {
  const files = readdirSync(migrationsDir())
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
  const current = db.pragma('user_version', { simple: true }) as number
  const applied: string[] = []
  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 4), 10)
    if (version <= current) continue
    const sql = readFileSync(join(migrationsDir(), file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${version}`)
    })()
    applied.push(file)
  }
  return { applied }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const db = openDb()
  const { applied } = runMigrations(db)
  console.log(
    applied.length > 0
      ? `migrated: ${applied.join(', ')} (user_version=${db.pragma('user_version', { simple: true })})`
      : `up to date (user_version=${db.pragma('user_version', { simple: true })})`,
  )
  db.close()
}
