import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countRows, getDataMode, openDb, runMigrations, setMeta } from '../src/index'

describe('migrations', () => {
  it('migrates a fresh in-memory db and is idempotent', () => {
    const db = openDb(':memory:')
    const first = runMigrations(db)
    expect(first.applied).toContain('0001_init.sql')
    expect(first.applied).toContain('0002_ev_runs.sql')
    const second = runMigrations(db)
    expect(second.applied).toEqual([])

    const evRunCols = (db.prepare(`PRAGMA table_info(ev_runs)`).all() as { name: string }[]).map(
      (c) => c.name,
    )
    for (const col of [
      'scenario',
      'prob_break_even',
      'prob_top_prize',
      'prob_ev_above_price',
      'ev_mean_cents',
      'iterations',
      'seed',
    ]) {
      expect(evRunCols).toContain(col)
    }

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    for (const expected of [
      'snapshots',
      'packs',
      'pack_metric_history',
      'pack_pulls',
      'listings',
      'listing_history',
      'sales',
      'source_status',
      'ev_runs',
      'meta',
    ]) {
      expect(names).toContain(expected)
    }
    expect(countRows(db, 'packs')).toBe(0)
    db.close()
  })

  it('respects a file path (env-override shape) and persists meta', () => {
    const path = join(tmpdir(), `renaisslens-test-${process.pid}-${Date.now()}.db`)
    const db = openDb(path)
    runMigrations(db)
    setMeta(db, 'data_mode', 'live')
    expect(getDataMode(db)).toBe('live')
    db.close()
  })
})
