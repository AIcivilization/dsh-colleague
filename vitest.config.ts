import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@core': '/Users/wf/自进化/临时/colleague-plugin/core',
      '@web': '/Users/wf/自进化/临时/colleague-plugin/web',
      '@config': '/Users/wf/自进化/临时/colleague-plugin/config',
    },
  },
});
