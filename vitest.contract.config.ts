import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/contract/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@web': resolve(__dirname, 'web'),
      '@config': resolve(__dirname, 'config'),
    },
  },
});
