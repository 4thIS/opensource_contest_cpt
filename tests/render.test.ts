import { describe, it, expect } from 'vitest';
import { renderReport, escapeHtml, encodeJsonForScript } from '../src/renderer/render.js';
import { emptyReport } from '../src/types.js';

const ASSETS = { js: 'console.log(1)', css: 'body{color:red}' };

describe('escapeHtml', () => {
  it('꺾쇠와 앰퍼샌드를 이스케이프한다', () => {
    expect(escapeHtml('<script>&')).toBe('&lt;script&gt;&amp;');
  });
  it('한글은 그대로 둔다', () => {
    expect(escapeHtml('임베디드')).toBe('임베디드');
  });
});

describe('encodeJsonForScript', () => {
  it('스크립트 종료 태그를 무력화한다', () => {
    const out = encodeJsonForScript({ s: '</script><img onerror=1>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).s).toBe('</script><img onerror=1>');
  });

  // JS 소스에서 줄 종결자라 원문자를 소스에 쓰지 않는다.
  it('U+2028·U+2029 를 이스케이프한다', () => {
    const raw = String.fromCharCode(0x2028) + 'x' + String.fromCharCode(0x2029);
    const out = encodeJsonForScript({ s: raw });
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
    expect(out).toContain('u2028');
    expect(JSON.parse(out).s).toBe(raw);
  });
});

describe('renderReport', () => {
  it('완전한 HTML 문서를 만든다', () => {
    const html = renderReport(emptyReport('C:/p', 'p'), ASSETS);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('CSS와 JS를 인라인한다 (외부 요청 없음)', () => {
    const html = renderReport(emptyReport('C:/p', 'p'), ASSETS);
    expect(html).toContain('body{color:red}');
    expect(html).toContain('console.log(1)');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel="stylesheet" href=');
  });

  it('리포트 데이터를 JSON으로 심는다', () => {
    const r = emptyReport('C:/w/공모전/임베디드', '임베디드');
    const html = renderReport(r, ASSETS);
    expect(html).toContain('id="ccaudit-data"');
    const m = html.match(/id="ccaudit-data"[^>]*>([\s\S]*?)<\/script>/);
    expect(JSON.parse(m![1]!).project.displayName).toBe('임베디드');
  });

  it('제목에 프로젝트명을 넣는다 (한글 유지)', () => {
    const html = renderReport(emptyReport('C:/w/임베디드', '임베디드'), ASSETS);
    expect(html).toContain('<title>ccaudit · 임베디드</title>');
  });

  it('UTF-8 meta를 넣는다', () => {
    expect(renderReport(emptyReport('C:/p', 'p'), ASSETS)).toContain('charset="utf-8"');
  });

  // [실행 중 수정] 플랜 원본은 `toContain('3')` 하나뿐이었는데, meta.generatedAt 이
  // 실시간 ISO 타임스탬프라 배너가 없어도 우연히 통과할 수 있다. 배너 요소까지 함께 본다.
  it('마스킹 건수가 0이 아니면 배너를 넣는다', () => {
    const r = emptyReport('C:/p', 'p');
    r.stats.redacted = 3;
    const html = renderReport(r, ASSETS);
    expect(html).toContain('3');
    expect(html).toMatch(/class="banner"[^>]*>[^<]*3[^<]*</);
  });

  it('마스킹 건수가 0이면 배너를 넣지 않는다', () => {
    const html = renderReport(emptyReport('C:/p', 'p'), ASSETS);
    expect(html).not.toContain('class="banner"');
  });

  it('프로젝트명의 HTML 특수문자를 이스케이프한다', () => {
    const html = renderReport(emptyReport('C:/p', '<img src=x onerror=alert(1)>'), ASSETS);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
