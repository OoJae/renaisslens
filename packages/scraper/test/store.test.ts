import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceDir } from '../src/snapshots/store'

describe('sourceDir (path-traversal safety)', () => {
  it('turns normal sources into a single safe segment', () => {
    expect(sourceDir('api-packs')).toBe('api-packs')
    expect(sourceDir('api-pack-detail:omega')).toBe('api-pack-detail__omega')
  })

  it('neutralizes separators and dot-segments so a hostile slug cannot traverse', () => {
    const hostile = sourceDir('api-pack-detail:../../../../tmp/pwn')
    expect(hostile).not.toContain('/')
    expect(hostile).not.toContain('..')
    // join() with the sanitized segment stays under the base — one flat directory
    const base = '/app/data/snapshots/live/sources'
    expect(join(base, hostile).startsWith(base)).toBe(true)
  })

  it('collapses any run of dots (a bare .. source)', () => {
    expect(sourceDir('..')).not.toContain('..')
    expect(sourceDir('..')).not.toBe('..')
  })
})
