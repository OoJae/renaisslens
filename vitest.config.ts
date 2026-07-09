import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
        },
      },
      {
        // mirror the web app's `@/*` → apps/web/src/* tsconfig path alias so
        // component tests can import modules that use it transitively
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
          },
        },
        test: {
          name: 'web',
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts'],
        },
      },
    ],
  },
})
