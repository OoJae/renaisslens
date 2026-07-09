import { Command } from 'commander'
import { CONFIG } from './config'
import { printReport, runCycle } from './cycle'
import { runEv } from './ev'
import { runMock } from './snapshots/mockLoader'
import { pruneLive } from './snapshots/store'

const program = new Command('renaisslens-scraper')

program
  .command('run')
  .description('one full polite ingestion cycle (live network)')
  .option(
    '--source <source>',
    'run a single source group: api-packs | api-pack-details | api-marketplace | site-home-activities | api-index (dormant)',
  )
  .action(async (opts: { source?: string }) => {
    try {
      const report = await runCycle({ only: opts.source })
      process.exitCode = printReport(report)
    } catch (err) {
      console.error(String(err instanceof Error ? err.message : err))
      process.exitCode = 1
    }
  })

program
  .command('mock')
  .description('load committed demo snapshots — zero network')
  .action(() => {
    const report = runMock()
    process.exitCode = printReport(report)
  })

program
  .command('ev')
  .description('compute EV ranges for all packs × scenarios from current DB state — zero network')
  .option('--pack <slug>', 'compute a single pack')
  .option('--iterations <n>', 'Monte Carlo iterations per scenario', '100000')
  .action((opts: { pack?: string; iterations: string }) => {
    const iterations = Number.parseInt(opts.iterations, 10)
    if (!Number.isInteger(iterations) || iterations < 1) {
      console.error(`--iterations must be a positive integer, got "${opts.iterations}"`)
      process.exitCode = 1
      return
    }
    const report = runEv({ pack: opts.pack, iterations })
    process.exitCode = printReport(report)
  })

program
  .command('watch')
  .description('continuous ingestion loop (per-source cadence with jitter)')
  .action(async () => {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const nextDue: Record<string, number> = {}
    // hourly housekeeping so long-running deploys don't accumulate live/ snapshots forever
    let pruneDue = Date.now() + 60 * 60_000
    console.log('watch: cadences', CONFIG.cadences)
    for (;;) {
      for (const group of Object.keys(CONFIG.cadences)) {
        if (Date.now() < (nextDue[group] ?? 0)) continue
        const report = await runCycle({ only: group })
        printReport(report)
        const cadence = CONFIG.cadences[group] ?? 30 * 60_000
        const jitter = cadence * 0.1 * (Math.random() * 2 - 1)
        nextDue[group] = Date.now() + cadence + jitter
      }
      if (Date.now() >= pruneDue) {
        try {
          const { deleted } = pruneLive(48)
          if (deleted > 0) console.log(`watch: pruned ${deleted} old live snapshot dir(s)`)
        } catch (err) {
          console.error(`watch: prune failed — ${String(err instanceof Error ? err.message : err)}`)
        }
        pruneDue = Date.now() + 60 * 60_000
      }
      await sleep(60_000)
    }
  })

program
  .command('capture-demo')
  .description('copy the latest OK snapshot of every source into data/snapshots/demo/')
  .action(async () => {
    const { captureDemo } = await import('./snapshots/captureDemo')
    const { captured } = captureDemo()
    console.log(`demo set captured from: ${captured.join(', ') || '(nothing OK in live/)'}`)
  })

program
  .command('prune')
  .description('delete old live snapshots (never quarantine/ or demo/)')
  .option('--keep <n>', 'snapshots to keep per source', '48')
  .action((opts: { keep: string }) => {
    const { deleted } = pruneLive(Number.parseInt(opts.keep, 10))
    console.log(`pruned ${deleted} snapshot dir(s)`)
  })

await program.parseAsync(process.argv)
