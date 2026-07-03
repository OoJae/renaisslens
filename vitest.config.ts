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
        test: {
          name: 'web',
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts'],
        },
      },
    ],
  },
})
