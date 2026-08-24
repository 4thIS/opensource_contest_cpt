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
  // 번들에 들어간 서드파티 코드의 라이선스 주석을 파일 끝에 모아 남긴다.
  // BSD-3-Clause 2항(바이너리 배포 시 고지)을 THIRD-PARTY-NOTICES.md 와 함께 충족한다.
  legalComments: 'eof',
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
