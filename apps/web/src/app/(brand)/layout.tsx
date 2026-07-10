import type { ReactNode } from 'react'

/**
 * The immersive brand shell — no dashboard chrome, edge-to-edge, on the deepest
 * void field. Shares the one root <html>/<body>/font layout via the (brand)
 * route group. The film (vignette + grain) is fixed above content, inert.
 */
export default function BrandLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink text-bone-50 antialiased">
      <a
        href="#main"
        className="sr-only rounded bg-slab px-3 py-2 text-plaque focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]"
      >
        Skip to content
      </a>
      {children}
      <div aria-hidden className="film-vignette pointer-events-none fixed inset-0 z-[55]" />
      <div
        aria-hidden
        className="film-grain pointer-events-none fixed inset-0 z-[60] opacity-[0.05] [mix-blend-mode:soft-light]"
      />
    </div>
  )
}
