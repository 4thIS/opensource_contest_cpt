import { describe, it, expect } from 'vitest';
import { parseCliArgs, runAudit, pickProject } from '../src/cli.js';

// 도그푸딩(2026-08-14)에서 잡은 결함: 조상 매칭이 배열에서 먼저 나온 것을 골라
// 리포 대신 `C:/Users/ddj25/work` 가 프로젝트로 잡혔다. 가장 가까운 조상이어야 한다.
describe('pickProject', () => {
  const p = (root: string) => ({ root });

  it('cwd 와 정확히 일치하는 프로젝트를 최우선으로 고른다', () => {
    expect(pickProject([p('C:/a'), p('C:/a/b')], 'C:/a/b')?.root).toBe('C:/a/b');
  });

  it('조상이 여럿이면 가장 가까운(긴) 것을 고른다', () => {
    expect(pickProject([p('C:/a'), p('C:/a/b')], 'C:/a/b/c')?.root).toBe('C:/a/b');
  });

  it('배열 순서에 좌우되지 않는다', () => {
    expect(pickProject([p('C:/a/b'), p('C:/a')], 'C:/a/b/c')?.root).toBe('C:/a/b');
  });

  it('한글 경로에서도 가까운 조상을 고른다', () => {
    const ps = [p('C:/Users/u/work'), p('C:/Users/u/work/공모전/오픈소스')];
    expect(pickProject(ps, 'C:/Users/u/work/공모전/오픈소스/repo')?.root)
      .toBe('C:/Users/u/work/공모전/오픈소스');
  });

  it('구분자와 대소문자가 달라도 맞춘다', () => {
    expect(pickProject([p('C:/A/B')], 'c:\\a\\b\\c')?.root).toBe('C:/A/B');
  });

  it('조상이 없으면 undefined', () => {
    expect(pickProject([p('C:/a')], 'D:/x')).toBeUndefined();
  });

  it('형제 경로를 조상으로 오인하지 않는다', () => {
    expect(pickProject([p('C:/a/bc')], 'C:/a/bcd')).toBeUndefined();
  });
});

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
