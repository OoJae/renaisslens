import { createHash } from 'node:crypto'
import type { NewSale } from '@renaisslens/db'
import { chromium } from 'playwright'
import { CONFIG } from '../config'
import { acquireSlot } from '../politeClient'

/**
 * Playwright DOM fallback for the Latest Activities feed — used only when the
 * flight-payload parse fails. Rows extracted here carry source '...:dom' and
 * synthetic dedupe ids (no tx hash in rendered text), i.e. lower confidence.
 *
 * ALL selectors live in this one exported const (one-file fix rule).
 */
export const SELECTORS = {
  headingText: 'Latest Activities',
  // generic: the section containing the heading; refined against the real DOM
  // if/when this fallback first fires in production
  rowCandidates: 'li, [class*="activity"], [class*="Activity"], a[href*="card"]',
} as const

export interface DomScrapeResult {
  html: string
  fetchedAt: string
  sales: NewSale[]
}

/** "$1,532.50" → 153250 cents. Text-only parse, no floats. */
export function dollarsTextToCents(text: string): number | null {
  const m = text.replaceAll(',', '').match(/\$\s*(\d+)(?:\.(\d{1,2}))?/)
  if (!m || m[1] === undefined) return null
  const dollars = Number.parseInt(m[1], 10)
  const centsPart = m[2] === undefined ? 0 : Number.parseInt(m[2].padEnd(2, '0'), 10)
  if (!Number.isSafeInteger(dollars * 100 + centsPart)) return null
  return dollars * 100 + centsPart
}

/**
 * Content-only id: the same title+price seen in later cycles dedupes instead
 * of re-inserting (the feed shows the same rows for hours). Cost: a genuine
 * repeat sale of the same card at the same price is under-counted — an
 * accepted, documented limitation of the lower-confidence DOM fallback.
 */
export function synthActivityId(title: string, priceCents: number): string {
  const h = createHash('sha256').update(`${title}|${priceCents}`).digest('hex')
  return `synth:${h}`
}

export async function scrapeActivitiesDom(): Promise<DomScrapeResult> {
  await acquireSlot() // same global politeness queue as every other request
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ userAgent: CONFIG.userAgent })
    const page = await context.newPage()
    // keep the footprint small: no images/fonts/media, no third-party requests
    const siteHost = new URL(CONFIG.siteBaseUrl).host
    await page.route('**/*', (route) => {
      const req = route.request()
      const type = req.resourceType()
      const host = new URL(req.url()).host
      if (type === 'image' || type === 'font' || type === 'media') return route.abort()
      if (host !== siteHost && !host.endsWith('.vercel-storage.com')) return route.abort()
      return route.continue()
    })
    await page.goto(CONFIG.siteBaseUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.pageTimeoutMs })
    await page.getByText(SELECTORS.headingText).first().waitFor({ timeout: CONFIG.pageTimeoutMs })

    const rows = await page.evaluate(
      ({ headingText, rowCandidates }) => {
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
        const heading = headings.find((h) => h.textContent?.includes(headingText))
        if (!heading) return []
        let section: Element | null = heading
        for (let i = 0; i < 5 && section; i++) {
          const candidates = section.querySelectorAll(rowCandidates)
          if (candidates.length >= 3) {
            return Array.from(candidates)
              .slice(0, 60)
              .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
              .filter((t) => t.includes('$'))
          }
          section = section.parentElement
        }
        return []
      },
      { headingText: SELECTORS.headingText, rowCandidates: SELECTORS.rowCandidates },
    )

    const html = await page.content()
    const fetchedAt = new Date().toISOString()
    const sales: NewSale[] = []
    for (const text of rows) {
      const priceCents = dollarsTextToCents(text)
      if (priceCents === null) continue
      const title = text.split('$')[0]?.trim() ?? ''
      if (title.length < 3) continue
      sales.push({
        activityId: synthActivityId(title, priceCents),
        tokenId: null,
        cardTitle: title,
        setName: null,
        grade: null,
        gradingCompany: null,
        priceCents,
        pctChange: null,
        soldAt: null, // relative times are NOT converted into fake precision
        source: 'site:home-activities:dom',
      })
    }
    return { html, fetchedAt, sales }
  } finally {
    await browser.close()
  }
}
