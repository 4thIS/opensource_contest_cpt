// scripts/build.mjs
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

// CLI: Node ESM 번들. diff는 번들에 포함해 npx 실행 시 설치 부담을 줄인다.
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
});

// 리포트 내부 앱: 브라우저 IIFE. 리포트에 문자열로 인라인된다.
await build({
  entryPoints: ['src/renderer/app.ts'],
  outfile: 'dist/report-app.js',
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  minify: true,
});

copyFileSync('src/renderer/report.css', 'dist/report.css');

console.log('build ok: dist/cli.js, dist/report-app.js, dist/report.css');
