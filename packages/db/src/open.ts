import SqliteDatabase from 'better-sqlite3'
import type { Database } from 'better-sqlite3'
import { defaultDbPath, ensureDirFor } from './paths'

export function openDb(path?: string, opts: { readonly?: boolean } = {}): Database {
  const dbPath = path ?? defaultDbPath()
  const readonly = opts.readonly ?? false
  if (dbPath !== ':memory:' && !readonly) ensureDirFor(dbPath)
  // readonly opens never create an empty DB file — a missing DB throws
  // SQLITE_CANTOPEN, which callers (web) render as "no data yet"
  const db = new SqliteDatabase(dbPath, { readonly })
  if (!readonly) {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}
