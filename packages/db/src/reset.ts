import { existsSync, rmSync } from 'node:fs'
import { runMigrations } from './migrate'
import { openDb } from './open'
import { defaultDbPath } from './paths'

const dbPath = defaultDbPath()
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const p = dbPath + suffix
  if (existsSync(p)) rmSync(p)
}
const db = openDb(dbPath)
runMigrations(db)
console.log(
  `reset: fresh db at ${dbPath} (user_version=${db.pragma('user_version', { simple: true })})`,
)
db.close()
