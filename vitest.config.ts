import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests run on Node. Worker integration tests (tests/worker/**) that need
// the Cloudflare workers runtime will be added with a separate
// vitest.config.worker.ts using @cloudflare/vitest-pool-workers once the
// worker entry (src/worker/index.ts) exists.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src/client'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@worker': path.resolve(import.meta.dirname, 'src/worker'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
})
