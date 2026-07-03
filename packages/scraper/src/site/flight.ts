/**
 * Next.js App Router RSC flight-payload extraction (primary path for the
 * homepage "Latest Activities" feed — the API has no equivalent endpoint).
 *
 * Marker-based and framing-agnostic: we join every self.__next_f.push chunk,
 * find a data marker (e.g. `"activities":[`), and extract one balanced JSON
 * value with a string/escape-aware scanner. Only a rename of the data keys
 * themselves breaks this — which would break any DOM assumption too.
 */

export class FlightParseError extends Error {
  constructor(
    message: string,
    readonly contextExcerpt?: string,
  ) {
    super(`FlightParseError: ${message}`)
    this.name = 'FlightParseError'
  }
}

const PUSH_RE = /self\.__next_f\.push\(\[\d+\s*,\s*"((?:[^"\\]|\\.)*)"\]\)/g

/** Join all flight chunks in document order, healing JSON split across push() calls. */
export function joinFlightChunks(html: string): string {
  const parts: string[] = []
  for (const match of html.matchAll(PUSH_RE)) {
    const escaped = match[1]
    if (escaped === undefined) continue
    try {
      parts.push(JSON.parse(`"${escaped}"`) as string)
    } catch {
      // a chunk that fails to unescape is skipped; the marker scan will
      // fail loudly downstream if it mattered
    }
  }
  if (parts.length === 0) throw new FlightParseError('no self.__next_f.push chunks found in HTML')
  return parts.join('')
}

/**
 * Find the first of `markers` in the flight text and parse the JSON value
 * that starts at the first '[' or '{' at/after the marker's value position.
 */
export function extractJsonByMarker(flightText: string, markers: string[]): unknown {
  for (const marker of markers) {
    const at = flightText.indexOf(marker)
    if (at === -1) continue
    const valueStart = findValueStart(flightText, at + marker.length)
    if (valueStart === -1) continue
    const raw = scanBalanced(flightText, valueStart)
    if (raw === null) continue
    try {
      return JSON.parse(raw)
    } catch (err) {
      throw new FlightParseError(
        `marker ${JSON.stringify(marker)} matched but JSON.parse failed: ${String(err)}`,
        raw.slice(0, 400),
      )
    }
  }
  const excerpt = flightText.slice(0, 400)
  throw new FlightParseError(
    `no marker matched (${markers.map((m) => JSON.stringify(m)).join(', ')})`,
    excerpt,
  )
}

function findValueStart(text: string, from: number): number {
  for (let i = from; i < text.length && i < from + 20; i++) {
    const ch = text[i]
    if (ch === '[' || ch === '{') return i
    if (ch === ' ' || ch === ':' || ch === '\n' || ch === '\t' || ch === '\r') continue
    return -1
  }
  return -1
}

/** Extract one complete balanced JSON array/object, string- and escape-aware. */
function scanBalanced(text: string, start: number): string | null {
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\')
        i++ // skip escaped char
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        // mismatched closer (e.g. '[' closed by '}') means corrupt framing
        return ch === close ? text.slice(start, i + 1) : null
      }
    }
  }
  return null
}

/** Markers tried in order for the Latest Activities initialData. */
export const ACTIVITY_MARKERS = ['"initialData":{"activities":', '"activities":']

export function extractActivities(html: string): unknown[] {
  const flightText = joinFlightChunks(html)
  const value = extractJsonByMarker(flightText, ACTIVITY_MARKERS)
  if (!Array.isArray(value)) {
    throw new FlightParseError(
      `activities marker resolved to ${typeof value}, expected array`,
      JSON.stringify(value).slice(0, 400),
    )
  }
  return value
}
