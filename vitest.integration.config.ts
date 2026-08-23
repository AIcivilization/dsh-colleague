import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@web': resolve(__dirname, 'web'),
      '@config': resolve(__dirname, 'config'),
    },
  },
});
