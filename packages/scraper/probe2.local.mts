import { countRows, getDataMode, openDb, runMigrations, setMeta } from '@renaisslens/db'
import { runCycle } from './src/cycle'
import { assertNoNetwork } from './src/politeClient'

const db = openDb(':memory:')
runMigrations(db)
setMeta(db, 'data_mode', 'mock') // state after `pnpm scrape:mock`
console.log('before:', getDataMode(db))
assertNoNetwork() // simulate offline: every fetch throws
const report = await runCycle({ db }) // plain `pnpm scrape`
for (const s of report.sources) console.log(`  ${s.source}: ${s.status}`)
const failed = report.sources.filter((s) => s.status !== 'ok').length
console.log('exit code would be:', failed === report.sources.length ? 1 : 2)
console.log(
  'rows ingested — packs:',
  countRows(db, 'packs'),
  'sales:',
  countRows(db, 'sales'),
  'listings:',
  countRows(db, 'listings'),
)
console.log('after:', getDataMode(db))
