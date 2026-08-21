import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['index.ts', 'web/main.tsx'],
  format: 'esm',
  dts: true,
  splitting: true,
  clean: true,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-tool-subagent',
    'react',
    'react-dom',
  ],
});
