'use client'

import {
  AdaptiveDpr,
  Environment,
  Lightformer,
  PerformanceMonitor,
  RoundedBox,
} from '@react-three/drei'
import { Canvas, extend, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { CanvasTexture, type Group, MathUtils, type Mesh } from 'three'
import { HoloFoilMaterial, type HoloFoilMaterialImpl } from '../_lib/holo-foil'
import { clamp01, useScrollStore } from '../_lib/scroll-store'

// Register the custom material as a JSX element BEFORE any <holoFoilMaterial> renders.
// Referencing HoloFoilMaterial as a runtime value here keeps the import (and its
// extend registration) from being tree-shaken under verbatimModuleSyntax.
extend({ HoloFoilMaterial })

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Bone cert label drawn to a canvas — self-contained (no external font file). */
function useCertTexture() {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 260
    const x = c.getContext('2d')
    if (!x) return null
    x.fillStyle = '#f2eee3'
    x.fillRect(0, 0, c.width, c.height)
    x.strokeStyle = '#cfc8b8'
    x.lineWidth = 2
    x.strokeRect(14, 14, c.width - 28, c.height - 28)
    x.fillStyle = '#1a1206'
    x.font = 'bold 30px ui-sans-serif, system-ui, sans-serif'
    x.fillText('RENAISSPROOF', 40, 66)
    x.font = 'bold 88px ui-monospace, monospace'
    x.fillText('GEM MINT 10', 38, 168)
    x.font = '30px ui-monospace, monospace'
    x.fillStyle = 'rgba(26,18,6,0.65)'
    x.fillText('CERT · 0000000001', 40, 220)
    const t = new CanvasTexture(c)
    t.anisotropy = 4
    return t
  }, [])
}

function Slab({ compact }: { compact: boolean }) {
  const group = useRef<Group>(null)
  const foil = useRef<HoloFoilMaterialImpl>(null)
  const seal = useRef<Mesh>(null)
  const cert = useCertTexture()
  const prevScroll = useRef(0)

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const s = useScrollStore.getState()
    const p = s.hero
    const ss = smoother(p)
    const t = state.clock.elapsedTime

    // rotation: askew + tilted (raw) → square (proven); pointer parallax
    const tY = MathUtils.lerp(-0.62, 0.0, ss) + s.px * 0.16
    const tX = MathUtils.lerp(0.16, 0.0, ss) + s.py * 0.1
    g.rotation.y = MathUtils.damp(g.rotation.y, tY, 5, dt)
    g.rotation.x = MathUtils.damp(g.rotation.x, tX, 5, dt)
    // idle bob fades out as it authenticates (mobile sits higher — copy stacks below)
    g.position.y = (compact ? 1.35 : 0) + Math.sin(t * 0.6) * 0.05 * (1 - p)

    // scroll velocity (for chromatic aberration on the rake)
    const vel = Math.min(1, Math.abs(p - prevScroll.current) * 60)
    prevScroll.current = p

    const f = foil.current
    if (f) {
      f.uTime = t
      f.uProgress = smoother(clamp01((p - 0.12) / 0.5))
      f.uFoilSweep = clamp01((p - 0.28) / 0.22)
      f.uAberration = Math.max(vel * 0.6, Math.sin(clamp01((p - 0.28) / 0.3) * Math.PI) * 0.5)
      f.uPointerX = s.px
    }
    // gold seal strikes at p>0.62 (easeOutBack scale-in)
    const sm = seal.current
    if (sm) {
      const k = clamp01((p - 0.62) / 0.16)
      const back = k < 1 ? 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2 : 1
      sm.scale.setScalar(k === 0 ? 0 : 0.42 * back)
      const mat = sm.material as { opacity: number; transparent: boolean }
      mat.transparent = true
      mat.opacity = k
    }
  })

  return (
    // desktop: sit in the left channel (cols 1–7); mobile: centered upper.
    // position.x persists (useFrame only writes .y for the idle bob).
    <group ref={group} position={[compact ? 0 : -1.5, 0, 0]} scale={compact ? 0.72 : 1}>
      {/* acrylic case — physical iridescence, no transmission pass (perf) */}
      <RoundedBox args={[2.05, 2.95, 0.16]} radius={0.06} smoothness={5}>
        <meshPhysicalMaterial
          color="#0b0712"
          roughness={0.14}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.12}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[120, 620]}
          transparent
          opacity={0.92}
          envMapIntensity={1.1}
        />
      </RoundedBox>

      {/* holographic card window */}
      <mesh position={[0, 0.32, 0.085]}>
        <planeGeometry args={[1.68, 1.86]} />
        <holoFoilMaterial ref={foil} />
      </mesh>

      {/* bone cert label */}
      {cert && (
        <mesh position={[0, -1.02, 0.085]}>
          <planeGeometry args={[1.68, 0.66]} />
          <meshBasicMaterial map={cert} toneMapped={false} />
        </mesh>
      )}

      {/* gold proof seal — strikes on authentication */}
      <mesh ref={seal} position={[0.52, -1.0, 0.1]} scale={0}>
        <circleGeometry args={[0.2, 48]} />
        <meshPhysicalMaterial
          color="#c8a24a"
          metalness={1}
          roughness={0.28}
          emissive="#efd08a"
          emissiveIntensity={0.35}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export default function SlabScene({ compact = false }: { compact?: boolean }) {
  const [dpr, setDpr] = useState(compact ? 1.25 : 1.75)
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={dpr}
      camera={{ position: compact ? [0, 0, 6.4] : [0, 0, 6], fov: 34 }}
      frameloop="always"
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 4, 3]} intensity={0.7} />
      <Environment resolution={128}>
        <Lightformer
          intensity={2.2}
          form="rect"
          scale={[4, 1, 1]}
          position={[0, 2.5, 3]}
          color="#a78bfa"
        />
        <Lightformer
          intensity={1.6}
          form="rect"
          scale={[3, 1, 1]}
          position={[-3, -1, 2]}
          color="#67e8f9"
        />
        <Lightformer intensity={1.4} form="circle" scale={2} position={[3, 1, 2]} color="#f0abfc" />
      </Environment>
      <Slab compact={compact} />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}
