import { describe, it, expect } from 'vitest';
import { matchesFile, matchesSession, stateLabel, groupByDir } from '../src/renderer/app.js';
import type { FileAudit, SessionSummary } from '../src/types.js';

const file = (relPath: string | null, absPath = 'C:/p/x'): FileAudit => ({
  id: 'i', absPath, relPath, status: 'modified', gitState: 'unknown',
  versions: [], touches: [], diff: null, diffAvailability: 'none',
});

describe('matchesFile', () => {
  it('빈 질의는 모두 통과', () => {
    expect(matchesFile(file('a/b.md'), '')).toBe(true);
  });
  it('상대경로 부분 일치', () => {
    expect(matchesFile(file('src/api.ts'), 'api')).toBe(true);
  });
  it('대소문자를 무시한다', () => {
    expect(matchesFile(file('src/API.ts'), 'api')).toBe(true);
  });
  it('한글 파일명을 찾는다', () => {
    expect(matchesFile(file('rc_car/진행상황.md'), '진행')).toBe(true);
  });
  it('relPath가 null이면 absPath로 찾는다', () => {
    expect(matchesFile(file(null, 'C:/other/settings.json'), 'settings')).toBe(true);
  });
  it('안 맞으면 false', () => {
    expect(matchesFile(file('a/b.md'), 'zzz')).toBe(false);
  });
});

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 's1', title: '설계명세서 검토', startedAt: '', endedAt: '', launchCwd: 'C:/p',
  cwds: [], gitBranches: [], ccVersion: '', model: null,
  counts: { user: 0, assistant: 0, tools: {} },
  tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  firstPrompt: '노면 인지 관련 질문', fileIds: [], inProgress: false, ...over,
});

describe('matchesSession', () => {
  it('제목으로 찾는다', () => {
    expect(matchesSession(session(), '명세서')).toBe(true);
  });
  it('첫 프롬프트로 찾는다', () => {
    expect(matchesSession(session(), '노면')).toBe(true);
  });
  it('제목이 없어도 죽지 않는다', () => {
    expect(matchesSession(session({ title: null }), '노면')).toBe(true);
  });
  it('안 맞으면 false', () => {
    expect(matchesSession(session(), 'zzz')).toBe(false);
  });
});

describe('stateLabel', () => {
  it('상태별 한글 라벨을 준다', () => {
    expect(stateLabel('committed').text).toBe('커밋됨');
    expect(stateLabel('uncommitted').text).toBe('미커밋');
    expect(stateLabel('superseded').text).toBe('이후 변경됨');
    expect(stateLabel('lost').text).toBe('유실');
    expect(stateLabel('unknown').text).toBe('판정 불가');
  });
  it('유실에 위험 클래스를 준다', () => {
    expect(stateLabel('lost').cls).toBe('bad');
  });
});

describe('groupByDir', () => {
  it('디렉터리별로 묶는다', () => {
    const g = groupByDir([file('a/x.md'), file('a/y.md'), file('b/z.md')]);
    expect(g.map((x) => x.dir)).toEqual(['a', 'b']);
    expect(g[0]!.files).toHaveLength(2);
  });
  it('루트 파일은 . 으로 묶는다', () => {
    expect(groupByDir([file('x.md')])[0]!.dir).toBe('.');
  });
  it('프로젝트 외부는 마지막에 별도 그룹', () => {
    const g = groupByDir([file('a/x.md'), file(null, 'C:/other/s.json')]);
    expect(g[g.length - 1]!.dir).toBe('(프로젝트 외부)');
  });
});
