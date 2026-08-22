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
  // CSS 不打包（rolldown 不支持），由 DSH 宿主或手动加载
  // assets: {
  //   include: ['web/index.css'],
  // },
});
