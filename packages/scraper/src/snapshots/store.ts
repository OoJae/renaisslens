import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { snapshotsRoot } from '@renaisslens/db'

export type SnapshotRootName = 'live' | 'demo'

export interface RawFile {
  name: string
  body: string | Buffer
  gzip?: boolean
}

export interface SnapshotMeta {
  source: string
  cycleId: string
  url: string
  fetchedAt: string
  httpStatus: number | null
  contentSha256: string
  status: 'ok' | 'quarantined' | 'failed'
  error: string | null
  files: string[]
  extraction?: string
}

export interface WrittenSnapshot {
  dir: string
  relDir: string
  rawPath: string
  contentSha256: string
  meta: SnapshotMeta
}

function tsDir(iso: string): string {
  return iso.replaceAll(':', '-').replaceAll('.', '-')
}

/** ':' is illegal in Windows paths — logical source names keep it, dirs don't. */
function sourceDir(source: string): string {
  return source.replaceAll(':', '__')
}

export function rootDir(root: SnapshotRootName): string {
  return join(snapshotsRoot(), root)
}

/** sha256 over the concatenated UNCOMPRESSED raw bodies — gzip is a storage detail. */
function sha256(files: RawFile[]): string {
  const h = createHash('sha256')
  for (const f of files) h.update(typeof f.body === 'string' ? Buffer.from(f.body) : f.body)
  return h.digest('hex')
}

export function writeSnapshot(input: {
  root: SnapshotRootName
  source: string
  cycleId: string
  url: string
  fetchedAt: string
  httpStatus?: number | null
  raw: RawFile[]
  parsed?: unknown
  status: 'ok' | 'quarantined' | 'failed'
  error?: string | null
  extraction?: string
}): WrittenSnapshot {
  const base = rootDir(input.root)
  const bucket = input.status === 'quarantined' ? 'quarantine' : 'sources'
  const relDir = join(bucket, sourceDir(input.source), tsDir(input.fetchedAt))
  const dir = join(base, relDir)
  mkdirSync(dir, { recursive: true })

  const fileNames: string[] = []
  for (const f of input.raw) {
    const name = f.gzip ? `${f.name}.gz` : f.name
    const body = f.gzip
      ? gzipSync(typeof f.body === 'string' ? Buffer.from(f.body) : f.body)
      : f.body
    writeFileSync(join(dir, name), body)
    fileNames.push(name)
  }
  if (input.parsed !== undefined) {
    writeFileSync(join(dir, 'parsed.json'), JSON.stringify(input.parsed, null, 2))
  }
  if (input.status === 'quarantined' && input.error) {
    writeFileSync(join(dir, 'error.json'), JSON.stringify({ error: input.error }, null, 2))
  }

  const meta: SnapshotMeta = {
    source: input.source,
    cycleId: input.cycleId,
    url: input.url,
    fetchedAt: input.fetchedAt,
    httpStatus: input.httpStatus ?? null,
    contentSha256: sha256(input.raw),
    status: input.status,
    error: input.error ?? null,
    files: fileNames,
    ...(input.extraction ? { extraction: input.extraction } : {}),
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))

  updateManifest(input.root, input.source, {
    latest: relDir,
    fetchedAt: input.fetchedAt,
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
  })

  return {
    dir,
    relDir,
    rawPath: join(relDir, fileNames[0] ?? 'meta.json'),
    contentSha256: meta.contentSha256,
    meta,
  }
}

export interface ManifestEntry {
  latest: string
  fetchedAt: string
  status: string
  error?: string
}

export interface Manifest {
  updatedAt: string
  cycleId?: string
  sources: Record<string, ManifestEntry>
}

export function readManifest(root: SnapshotRootName): Manifest {
  const path = join(rootDir(root), 'manifest.json')
  if (!existsSync(path)) return { updatedAt: '', sources: {} }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

/** Atomic write: tmp file + rename. */
function updateManifest(root: SnapshotRootName, source: string, entry: ManifestEntry): void {
  const base = rootDir(root)
  mkdirSync(base, { recursive: true })
  const manifest = readManifest(root)
  manifest.sources[source] = entry
  manifest.updatedAt = new Date().toISOString()
  const path = join(base, 'manifest.json')
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(manifest, null, 2))
  renameSync(tmp, path)
}

export interface LatestSnapshot {
  meta: SnapshotMeta
  dir: string
  /** raw file contents, gunzip NOT applied (caller knows the format) */
  readRaw: (name: string) => Buffer
  parsed?: unknown
}

export function readLatest(root: SnapshotRootName, source: string): LatestSnapshot | null {
  const manifest = readManifest(root)
  const entry = manifest.sources[source]
  if (!entry) return null
  const dir = join(rootDir(root), entry.latest)
  if (!existsSync(join(dir, 'meta.json'))) return null
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as SnapshotMeta
  const parsedPath = join(dir, 'parsed.json')
  return {
    meta,
    dir,
    readRaw: (name: string) => readFileSync(join(dir, name)),
    parsed: existsSync(parsedPath) ? JSON.parse(readFileSync(parsedPath, 'utf8')) : undefined,
  }
}

/** Delete oldest snapshot dirs per source beyond `keep`; never touches quarantine/ or demo/. */
export function pruneLive(keep: number): { deleted: number } {
  const sourcesDir = join(rootDir('live'), 'sources')
  if (!existsSync(sourcesDir)) return { deleted: 0 }
  let deleted = 0
  for (const source of readdirSync(sourcesDir)) {
    const sourceDir = join(sourcesDir, source)
    const entries = readdirSync(sourceDir).sort() // timestamp dirs sort chronologically
    const excess = entries.length - keep
    for (let i = 0; i < excess; i++) {
      const entry = entries[i]
      if (entry === undefined) continue
      rmSync(join(sourceDir, entry), { recursive: true })
      deleted++
    }
  }
  return { deleted }
}
