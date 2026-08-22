import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['index.ts', 'web/main.tsx'],
  format: 'esm',
  dts: true,
  splitting: true,
  clean: true,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-llm',
    'react',
    'react-dom',
    'yaml',
  ],
  // CSS is not bundled (rolldown doesn't support it); loaded by DSH host or manually
  // assets: {
  //   include: ['web/index.css'],
  // },
});
