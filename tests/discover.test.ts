import { describe, it, expect, afterEach } from 'vitest';
import { claudeHome, listSessionFiles } from '../src/reader/discover.js';

const FIXTURE = 'tests/fixtures/cjk-collision';

afterEach(() => { delete process.env.CCAUDIT_CLAUDE_HOME; });

describe('claudeHome', () => {
  it('CCAUDIT_CLAUDE_HOME을 최우선으로 쓴다', () => {
    process.env.CCAUDIT_CLAUDE_HOME = FIXTURE;
    expect(claudeHome()).toContain('cjk-collision');
  });

  it('환경변수가 없으면 홈의 .claude를 가리킨다', () => {
    expect(claudeHome().endsWith('.claude')).toBe(true);
  });
});

describe('listSessionFiles', () => {
  it('한 폴더 안의 세션 파일을 모두 찾는다', () => {
    const files = listSessionFiles(FIXTURE);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.sessionId).sort()).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('두 세션이 같은 projectDir을 공유한다 (충돌 재현)', () => {
    const dirs = new Set(listSessionFiles(FIXTURE).map((f) => f.projectDir));
    expect(dirs.size).toBe(1);
  });

  it('projects 폴더가 없으면 빈 배열을 준다', () => {
    expect(listSessionFiles('tests/fixtures/__nonexistent__')).toEqual([]);
  });
});
