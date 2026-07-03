export const usd = (cents: number | null): string =>
  cents === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

/** Compact dollars for chart axis ticks: $22, $1.5k, $153k. */
export const usdCompact = (cents: number): string => {
  const dollars = cents / 100
  if (dollars >= 1000) {
    const k = dollars / 1000
    return `$${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
  }
  return `$${Math.round(dollars)}`
}

export const formatInt = (n: number): string => new Intl.NumberFormat('en-US').format(n)

/** "34 min ago" / "2 h ago" / "3 d ago"; beyond 7 days, the date itself. */
export const relativeTime = (iso: string, now: Date = new Date()): string => {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days <= 7) return `${days} d ago`
  return iso.slice(0, 10)
}
