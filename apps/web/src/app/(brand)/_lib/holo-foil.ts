import { shaderMaterial } from '@react-three/drei'
import type { Object3DNode } from '@react-three/fiber'
import { Color, type ShaderMaterial } from 'three'

/**
 * The holographic foil — a 4-pole diffraction spectrum driven by fresnel +
 * scroll progress + pointer. Matte/desaturated at uProgress 0 (raw card),
 * fully struck holo at 1 (graded). A moving band = the foil sweep; a subtle
 * guilloché from the rosette keeps it reading as a real trading-card foil.
 */
export const HoloFoilMaterial = shaderMaterial(
  {
    uTime: 0,
    uProgress: 0,
    uFoilSweep: 0,
    uAberration: 0,
    uPointerX: 0,
    uColorA: new Color('#a78bfa'),
    uColorB: new Color('#67e8f9'),
    uColorC: new Color('#7bf1d2'),
    uColorD: new Color('#f0abfc'),
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    uniform float uTime, uProgress, uFoilSweep, uAberration, uPointerX;
    uniform vec3 uColorA, uColorB, uColorC, uColorD;

    vec3 spectrum(float t) {
      t = fract(t);
      if (t < 0.3333) return mix(uColorA, uColorB, t * 3.0);
      if (t < 0.6666) return mix(uColorB, uColorC, (t - 0.3333) * 3.0);
      return mix(uColorC, uColorD, (t - 0.6666) * 3.0);
    }

    float guilloche(vec2 uv) {
      vec2 p = (uv - 0.5) * 2.0;
      float a = atan(p.y, p.x);
      float r = length(p);
      float g = sin(r * 34.0 - uTime * 0.25) * 0.5 + 0.5;
      g *= sin(a * 10.0) * 0.5 + 0.5;
      return g;
    }

    void main() {
      float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
      float hue = vUv.x * 0.55 + vUv.y * 0.35 + fres * 1.1 + uPointerX * 0.25 + uTime * 0.02;
      vec3 col = spectrum(hue);

      // moving foil-sweep band
      float band = smoothstep(0.08, 0.0, abs(vUv.y - (uFoilSweep * 1.25 - 0.12)));
      col += band * 0.55;

      // subtle guilloché rosette
      col = mix(col * 0.72, col, guilloche(vUv) * 0.5 + 0.5);

      // matte + desaturated when raw; vivid struck-holo when proven
      float sat = mix(0.12, 1.0, uProgress);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, sat);
      col *= mix(0.45, 1.05, uProgress);

      // chromatic aberration at the grazing rim, scaled by scroll velocity
      col.r += uAberration * fres * 0.35;
      col.b -= uAberration * fres * 0.25;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
)

// NOTE: extend({ HoloFoilMaterial }) is called in slab-scene.tsx (the file that
// renders <holoFoilMaterial>). Registering it there — with a runtime value
// reference — guarantees the side-effect survives tree-shaking and that this
// module is never reduced to a type-only (elided) import under verbatimModuleSyntax.

// JSX intrinsic for the extended material (r3f v8; verbatimModuleSyntax-safe)
export type HoloFoilMaterialImpl = ShaderMaterial & {
  uTime: number
  uProgress: number
  uFoilSweep: number
  uAberration: number
  uPointerX: number
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    holoFoilMaterial: Object3DNode<HoloFoilMaterialImpl, typeof HoloFoilMaterial>
  }
}
