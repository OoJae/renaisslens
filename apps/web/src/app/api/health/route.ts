import {
  countRows,
  type Database,
  getDataMode,
  getFreshness,
  getMeta,
  openDb,
} from '@renaisslens/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  let db: Database | undefined
  try {
    db = openDb(undefined, { readonly: true })
    const body = {
      ok: true,
      dataMode: getDataMode(db),
      demoCapturedAt: getMeta(db, 'demo_captured_at'),
      rows: {
        packs: countRows(db, 'packs'),
        packPulls: countRows(db, 'pack_pulls'),
        listings: countRows(db, 'listings'),
        sales: countRows(db, 'sales'),
        snapshots: countRows(db, 'snapshots'),
        evRuns: countRows(db, 'ev_runs'),
      },
      freshness: getFreshness(db),
    }
    return NextResponse.json(body)
  } catch {
    // no internals in the response body — this endpoint is public
    return NextResponse.json({ ok: false, error: 'database not ready' }, { status: 503 })
  } finally {
    db?.close()
  }
}
