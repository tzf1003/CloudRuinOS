import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000, // Integration tests with cloud resources may take longer
    hookTimeout: 15000,
  },
})