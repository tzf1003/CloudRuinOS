import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    env: {
      NODE_ENV: 'test',
      VITEST_ENVIRONMENT: 'e2e'
    },
    setupFiles: [],
    globalSetup: [],
    reporters: ['verbose'],
    outputFile: {
      json: './test-results/e2e-results.json',
      junit: './test-results/e2e-results.xml'
    }
  },
  esbuild: {
    target: 'node18'
  }
});