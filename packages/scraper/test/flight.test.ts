import { describe, expect, it } from 'vitest'
import {
  extractActivities,
  extractJsonByMarker,
  FlightParseError,
  joinFlightChunks,
} from '../src/site/flight'

/** Build a minimal Next.js App Router page with flight chunks. */
function page(chunks: string[]): string {
  const scripts = chunks
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join('\n')
  return `<!DOCTYPE html><html><body><div id="__next"></div>${scripts}</body></html>`
}

const ACTIVITIES = [
  { id: '0xabc123', cardTitle: 'Charizard VMAX PSA 10', priceInUsdt: '153200000000000000000' },
  { id: '0xdef456', cardTitle: 'Luffy OP-01 BGS 9.5', priceInUsdt: '42000000000000000000' },
]

describe('joinFlightChunks', () => {
  it('joins chunks in document order and unescapes', () => {
    const html = page(['a1b:{"hello":', '"wor\\"ld"}'])
    expect(joinFlightChunks(html)).toBe('a1b:{"hello":"wor\\"ld"}')
  })

  it('throws when no flight chunks exist', () => {
    expect(() => joinFlightChunks('<html><body>static</body></html>')).toThrow(FlightParseError)
  })
})

describe('extractJsonByMarker', () => {
  it('extracts a balanced JSON value split ACROSS push() chunks', () => {
    const payload = `x:{"initialData":{"activities":${JSON.stringify(ACTIVITIES)}},"other":1}`
    const mid = Math.floor(payload.length / 2)
    const html = page([payload.slice(0, mid), payload.slice(mid)])
    const joined = joinFlightChunks(html)
    const value = extractJsonByMarker(joined, ['"activities":'])
    expect(value).toEqual(ACTIVITIES)
  })

  it('is string-aware: brackets inside strings do not break the scan', () => {
    const tricky = [{ id: '0x1', cardTitle: 'Pikachu [Jungle] {1st Ed}', note: 'a]b}c' }]
    const html = page([`{"activities":${JSON.stringify(tricky)}}`])
    const value = extractJsonByMarker(joinFlightChunks(html), ['"activities":'])
    expect(value).toEqual(tricky)
  })

  it('throws with an excerpt when no marker matches', () => {
    const html = page(['{"somethingElse":[1,2,3]}'])
    expect(() => extractJsonByMarker(joinFlightChunks(html), ['"activities":'])).toThrow(
      FlightParseError,
    )
  })
})

describe('extractActivities', () => {
  it('round-trips activities from a realistic page', () => {
    const payload = `{"initialData":{"activities":${JSON.stringify(ACTIVITIES)},"cursor":null}}`
    const html = page([payload])
    expect(extractActivities(html)).toEqual(ACTIVITIES)
  })

  it('rejects a corrupted payload (fallback trigger)', () => {
    const html = page(['{"initialData":{"activities":{"not":"an array"}}}'])
    expect(() => extractActivities(html)).toThrow(FlightParseError)
  })
})
