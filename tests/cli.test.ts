import { describe, it, expect } from 'vitest';
import { parseCliArgs, runAudit } from '../src/cli.js';

describe('parseCliArgs', () => {
  it('기본값: redact 켜짐, transcript 포함, out은 ccaudit-report.html', () => {
    const o = parseCliArgs([]);
    expect(o.redact).toBe(true);
    expect(o.transcript).toBe(true);
    expect(o.out).toBe('ccaudit-report.html');
    expect(o.open).toBe(false);
  });

  it('--no-redact 로 마스킹을 끈다', () => {
    expect(parseCliArgs(['--no-redact']).redact).toBe(false);
  });

  it('--no-transcript 로 대화를 뺀다', () => {
    expect(parseCliArgs(['--no-transcript']).transcript).toBe(false);
  });

  it('--out 으로 출력 경로를 바꾼다', () => {
    expect(parseCliArgs(['--out', 'r.html']).out).toBe('r.html');
  });

  it('--open 과 --since 를 읽는다', () => {
    const o = parseCliArgs(['--open', '--since', '2026-07-01']);
    expect(o.open).toBe(true);
    expect(o.since).toBe('2026-07-01');
  });

  it('--help 를 인식한다', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
  });

  it('알 수 없는 플래그는 무시하고 죽지 않는다', () => {
    expect(() => parseCliArgs(['--nonsense'])).not.toThrow();
  });
});

describe('runAudit', () => {
  it('픽스처 홈으로 임베디드 프로젝트를 감사한다', () => {
    const r = runAudit(
      { ...parseCliArgs([]), home: 'tests/fixtures/cjk-collision' },
      'C:/Users/testuser/work/공모전/임베디드',
    );
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.report.project.displayName).toBe('임베디드');
    expect(r.html).toContain('<!doctype html>');
  });

  it('세션이 없는 cwd는 오류 메시지를 준다', () => {
    const r = runAudit(
      { ...parseCliArgs([]), home: 'tests/fixtures/cjk-collision' },
      'C:/nowhere',
    );
    expect('error' in r).toBe(true);
  });

  it('~/.claude 가 없으면 오류 메시지를 준다', () => {
    const r = runAudit(
      { ...parseCliArgs([]), home: 'tests/fixtures/__missing__' },
      'C:/x',
    );
    expect('error' in r).toBe(true);
  });

  it('--no-transcript 면 messages가 빠진다', () => {
    const r = runAudit(
      { ...parseCliArgs(['--no-transcript']), home: 'tests/fixtures/cjk-collision' },
      'C:/Users/testuser/work/공모전/임베디드',
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.report.sessions[0]!.messages).toBeUndefined();
  });
});
