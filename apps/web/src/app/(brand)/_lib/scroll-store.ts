import { create } from 'zustand'

/**
 * Single source of truth for the authenticate scene. ScrollTrigger/Lenis WRITE
 * `hero` (0→1 across the hero) + pointer; the R3F scene READS it in useFrame via
 * getState() (never subscribes → zero React re-renders on the hot path). HTML
 * that shows a live readout may subscribe reactively.
 */
interface ScrollState {
  hero: number
  px: number
  py: number
}

export const useScrollStore = create<ScrollState>(() => ({ hero: 0, px: 0, py: 0 }))

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
