import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // provisional vault palette — the real design-token pass is Milestone 4
        vault: {
          950: '#0b0712',
          900: '#120b1d',
          800: '#1c1230',
          700: '#2a1c46',
        },
        prism: '#a78bfa',
      },
    },
  },
  plugins: [],
} satisfies Config
