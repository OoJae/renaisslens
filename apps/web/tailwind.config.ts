import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // the void behind the vitrine — deeper than vault, the letterbox/vignette pole
        ink: '#060409',
        // the vault: deep violet-black field drawn from renaiss.xyz's own look
        vault: {
          950: '#0b0712',
          900: '#120b1d',
          800: '#1c1230',
          700: '#2a1c46',
        },
        // the ONE warm-violet glow pooling under the slab — the museum spotlight, used nowhere else
        velvet: '#241542',
        // prismatic-glass accents. NOTE: `facet` may only appear INSIDE the holographic
        // material (holo-slab gradient), never as a flat swatch — see the Chanel cut.
        prism: '#a78bfa',
        facet: '#67e8f9',
        // the extra holo poles that make the foil a real diffraction spectrum (not a 2-stop gradient)
        holo: {
          mint: '#7bf1d2',
          rose: '#f0abfc',
        },
        // bone card-stock — the grading-slab cert-label surface, the one deliberately light surface
        slab: {
          DEFAULT: '#f2eee3',
          line: '#cfc8b8',
        },
        // bone at text weight (warmer than zinc) for body/display on the dark field
        bone: {
          50: '#ece7db',
        },
        // warm espresso ink for text ON bone — letterpress, not blue-black
        plaque: '#1a1206',
        // dimmest allowed real text (muted violet-gray labels/eyebrows on dark)
        fog: '#8a7fa6',
        // cert-gold foil ramp — EARNED: absent until the slab authenticates, then only 3 places
        seal: {
          hi: '#efd08a',
          DEFAULT: '#c8a24a',
          lo: '#8a6a2f',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // couture display for the brand landing (Fraunces variable)
        couture: ['var(--font-couture)', 'ui-serif', 'Georgia', 'serif'],
        // cert / proof data (Space Mono) — upgrades all existing font-mono usage app-wide
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
