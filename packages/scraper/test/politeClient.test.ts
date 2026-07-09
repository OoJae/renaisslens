import { afterEach, describe, expect, it, vi } from 'vitest'
import { politeGet } from '../src/politeClient'

// minimal 200 OK stand-in for fetch's Response (only the bits politeGet reads)
const okResponse = (body = '{}') => ({
  status: 200,
  ok: true,
  text: async () => body,
  headers: { get: () => null },
})

/** Read back the headers object passed to the stubbed fetch on call `i`. */
function headersOfCall(mock: ReturnType<typeof vi.fn>, i = 0): Record<string, string> {
  const init = mock.mock.calls[i]?.[1] as RequestInit | undefined
  return (init?.headers ?? {}) as Record<string, string>
}

afterEach(() => vi.unstubAllGlobals())

describe('politeGet auth headers', () => {
  it('forwards an Authorization header from opts.headers', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await politeGet('https://api.renaissos.com/x', {
      source: 'api-index',
      headers: { Authorization: 'Bearer secret' },
    })
    const headers = headersOfCall(fetchMock)
    expect(headers.Authorization).toBe('Bearer secret')
    expect(headers['user-agent']).toContain('RenaissLens')
  })

  it('never lets opts.headers strip or override the identified user-agent', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await politeGet('https://x', { source: 'api-index', headers: { 'user-agent': 'evil' } })
    expect(headersOfCall(fetchMock)['user-agent']).toContain('RenaissLens')
  })

  it('defaults accept to application/json and lets opts.accept override', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await politeGet('https://x', { source: 's' })
    expect(headersOfCall(fetchMock).accept).toBe('application/json')

    fetchMock.mockClear()
    await politeGet('https://x', { source: 's', accept: 'text/html' })
    expect(headersOfCall(fetchMock).accept).toBe('text/html')
  })
})
