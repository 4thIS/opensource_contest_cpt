import type { AuditReport } from '../types.js';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** U+2028·U+2029 는 JS 소스에서 줄 종결자라 정규식 리터럴 대신 생성자로 만든다. */
const LINE_SEPARATORS = new RegExp('[\u2028\u2029]', 'g');

/** `</script>` 로 문서를 탈출하지 못하게 막는다. JSON.parse 결과는 동일하다. */
export function encodeJsonForScript(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(LINE_SEPARATORS, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

export function renderReport(
  report: AuditReport,
  assets: { js: string; css: string },
): string {
  const name = escapeHtml(report.project.displayName);
  const s = report.stats;

  const redactBanner = s.redacted > 0
    ? `<div class="banner">🔒 시크릿 ${s.redacted}건이 마스킹되었습니다. 공유 전 내용을 확인하세요.</div>`
    : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ccaudit · ${name}</title>
<style>${assets.css}</style>
</head>
<body>
<header class="head">
  <h1>ccaudit · ${name}</h1>
  <p class="path">${escapeHtml(report.project.root)}</p>
  <p class="range">${escapeHtml(report.range.from)} ~ ${escapeHtml(report.range.to)}</p>
  <ul class="stats">
    <li>세션 <b>${s.sessions}</b></li>
    <li>생성 <b>${s.created}</b></li>
    <li>수정 <b>${s.modified}</b></li>
    <li class="add">+${s.linesAdded}</li>
    <li class="del">-${s.linesRemoved}</li>
    <li class="warn">미커밋 <b>${s.uncommitted}</b></li>
    <li class="bad">유실 <b>${s.lost}</b></li>
  </ul>
  ${redactBanner}
</header>

<nav class="tabs">
  <button data-tab="files" class="active">파일 감사</button>
  <button data-tab="sessions">세션</button>
  <button data-tab="warnings">경고 ${report.warnings.length}</button>
  <input id="q" type="search" placeholder="파일·세션·프롬프트 검색">
</nav>

<main>
  <section id="tab-files" class="tab active"></section>
  <section id="tab-sessions" class="tab"></section>
  <section id="tab-warnings" class="tab"></section>
</main>

<footer class="foot">
  생성 ${escapeHtml(report.meta.generatedAt)} · ccaudit ${escapeHtml(report.meta.toolVersion)}
</footer>

<script id="ccaudit-data" type="application/json">${encodeJsonForScript(report)}</script>
<script>${assets.js}</script>
</body>
</html>`;
}
