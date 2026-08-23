import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@web': resolve(__dirname, 'web'),
      '@config': resolve(__dirname, 'config'),
    },
  },
});
