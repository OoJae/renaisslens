import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // the vault: deep violet-black field drawn from renaiss.xyz's own look
        vault: {
          950: '#0b0712',
          900: '#120b1d',
          800: '#1c1230',
          700: '#2a1c46',
        },
        // prismatic-glass accents (gradient strips run from-prism to-facet)
        prism: '#a78bfa',
        facet: '#67e8f9',
        // bone card-stock — the grading-slab cert-label surface, the one
        // deliberately light surface in the whole UI
        slab: {
          DEFAULT: '#f2eee3',
          line: '#cfc8b8',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
