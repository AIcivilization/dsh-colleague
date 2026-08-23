import { defineConfig } from 'tsdown';
import { renameSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
  onSuccess: () => {
    // tsdown's dts plugin outputs hashed filenames (e.g. index-CQ6AbJ6P.d.ts).
    // Rename them to stable names so package.json exports can reference them.
    const distDir = resolve(process.cwd(), 'dist');
    if (!existsSync(distDir)) return;

    const renames: Array<[string, string]> = [
      // [pattern containing hash, stable name]
    ];

    for (const file of readdirSync(distDir)) {
      // index-<hash>.d.ts -> index.d.ts
      if (/^index-[A-Za-z0-9_-]+\.d\.ts$/.test(file)) {
        renames.push([file, 'index.d.ts']);
      }
      // index-<hash>.d.ts.map -> index.d.ts.map
      if (/^index-[A-Za-z0-9_-]+\.d\.ts\.map$/.test(file)) {
        renames.push([file, 'index.d.ts.map']);
      }
      // types-<hash>.d.ts -> types.d.ts (shared types chunk)
      if (/^types-[A-Za-z0-9_-]+\.d\.ts$/.test(file)) {
        renames.push([file, 'types.d.ts']);
      }
      if (/^types-[A-Za-z0-9_-]+\.d\.ts\.map$/.test(file)) {
        renames.push([file, 'types.d.ts.map']);
      }
    }

    // Web subdirectory
    const webDir = resolve(distDir, 'web');
    if (existsSync(webDir)) {
      for (const file of readdirSync(webDir)) {
        if (/^main-[A-Za-z0-9_-]+\.d\.ts$/.test(file)) {
          renames.push([`web/${file}`, 'web/main.d.ts']);
        }
        if (/^main-[A-Za-z0-9_-]+\.d\.ts\.map$/.test(file)) {
          renames.push([`web/${file}`, 'web/main.d.ts.map']);
        }
      }
    }

    for (const [from, to] of renames) {
      const fromPath = resolve(distDir, from);
      const toPath = resolve(distDir, to);
      if (existsSync(fromPath)) {
        renameSync(fromPath, toPath);
        console.log(`  renamed: ${from} -> ${to}`);
      }
    }
  },
});
