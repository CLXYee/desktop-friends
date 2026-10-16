import { defineConfig } from 'vitest/config';

// End-to-end tests against the running backend in VITE_API_BASE_URL (npm run test:e2e). They need the
// backend and nginx running and the test accounts (npm run users:test), so `npm test` skips them.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
