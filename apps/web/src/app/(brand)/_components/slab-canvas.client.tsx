'use client'

import Lenis from 'lenis'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { clamp01, useScrollStore } from '../_lib/scroll-store'
import { SlabPoster } from './slab-poster'

// the three.js scene is never imported until we've decided to run WebGL
const SlabScene = dynamic(() => import('./slab-scene'), { ssr: false, loading: () => null })

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * The pinned slab: a fixed layer behind the content that authenticates as the
 * hero scrolls, then fades as you enter the sequence. Progressive enhancement —
 * prefers-reduced-motion / no-WebGL fall back to the static CSS SlabPoster in
 * the settled "proven" pose, with the same scroll-linked fade for legibility.
 */
export function SlabCanvas() {
  const [webgl, setWebgl] = useState(false)
  const [compact, setCompact] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.matchMedia('(max-width: 1023px)').matches
    setCompact(small)

    const setFrom = (scroll: number) => {
      const vh = window.innerHeight || 1
      useScrollStore.setState({ hero: clamp01(scroll / (1.4 * vh)) })
      if (host.current) {
        host.current.style.opacity = String(1 - clamp01((scroll - 1.4 * vh) / (0.7 * vh)))
      }
    }

    // fallback: static poster, native scroll, scroll-linked fade only (no rAF loop)
    if (reduce || !supportsWebGL()) {
      useScrollStore.setState({ hero: 1 })
      const onScroll = () => setFrom(window.scrollY)
      onScroll()
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }

    // WebGL: mount after first paint (poster is the LCP; three never blocks it)
    const mount = requestAnimationFrame(() => setWebgl(true))
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    let raf = requestAnimationFrame(function loop(t: number) {
      lenis.raf(t)
      raf = requestAnimationFrame(loop)
    })
    lenis.on('scroll', ({ scroll }: { scroll: number }) => setFrom(scroll))
    setFrom(0)
    const onMove = (e: PointerEvent) => {
      useScrollStore.setState({
        px: (e.clientX / window.innerWidth) * 2 - 1,
        py: (e.clientY / window.innerHeight) * 2 - 1,
      })
    }
    if (!small) window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      cancelAnimationFrame(mount)
      cancelAnimationFrame(raf)
      lenis.destroy()
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div
      ref={host}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2] transition-opacity duration-500"
    >
      {webgl ? (
        <SlabScene compact={compact} />
      ) : (
        <div className="flex h-[100svh] w-full items-start justify-center pt-[8svh] lg:items-center lg:justify-start lg:pl-[7%] lg:pt-0">
          <SlabPoster className="w-[min(68vw,20rem)]" state="proven" />
        </div>
      )}
    </div>
  )
}
