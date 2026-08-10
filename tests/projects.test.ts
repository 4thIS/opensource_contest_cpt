import { describe, it, expect } from 'vitest';
import { readSessionFile } from '../src/reader/jsonl.js';
import { listSessionFiles } from '../src/reader/discover.js';
import { extractSessionMeta, groupIntoProjects } from '../src/resolver/projects.js';

function metasFrom(fixture: string) {
  return listSessionFiles(fixture).map((f) =>
    extractSessionMeta(f.sessionId, readSessionFile(f.absPath).records, {
      projectDir: f.projectDir,
      truncatedTail: readSessionFile(f.absPath).truncatedTail,
    }),
  );
}

describe('CJK 폴더명 충돌', () => {
  it('한 폴더에 있어도 cwd가 다르면 두 프로젝트로 나뉜다', () => {
    const projects = groupIntoProjects(metasFrom('tests/fixtures/cjk-collision'));
    expect(projects).toHaveLength(2);
    const names = projects.map((p) => p.displayName).sort();
    expect(names).toEqual(['오픈소스', '임베디드']);
  });

  it('각 프로젝트가 세션 1개씩 가진다', () => {
    const projects = groupIntoProjects(metasFrom('tests/fixtures/cjk-collision'));
    expect(projects.every((p) => p.sessions.length === 1)).toBe(true);
  });

  it('한글이 대시로 뭉개진 폴더명을 프로젝트 루트로 쓰지 않는다', () => {
    const projects = groupIntoProjects(metasFrom('tests/fixtures/cjk-collision'));
    expect(projects.some((p) => p.root.includes('---'))).toBe(false);
  });
});

describe('세션 도중 cwd 이동', () => {
  it('소속은 첫 메시지의 cwd로 확정된다', () => {
    const metas = metasFrom('tests/fixtures/cwd-moved');
    expect(metas[0]!.launchCwd.endsWith('/proj')).toBe(true);
  });

  it('이동한 cwd도 모두 기록한다', () => {
    const metas = metasFrom('tests/fixtures/cwd-moved');
    expect(metas[0]!.cwds.length).toBeGreaterThanOrEqual(2);
  });

  it('하위 폴더로 이동해도 프로젝트는 하나다', () => {
    expect(groupIntoProjects(metasFrom('tests/fixtures/cwd-moved'))).toHaveLength(1);
  });
});

describe('상위 폴더 병합 금지', () => {
  it('형제 폴더는 상위로 합쳐지지 않는다', () => {
    const metas = [
      { id: 's1', launchCwd: 'C:/w/공모전/임베디드', cwds: ['C:/w/공모전/임베디드'] },
      { id: 's2', launchCwd: 'C:/w/공모전/오픈소스', cwds: ['C:/w/공모전/오픈소스'] },
    ] as never[];
    expect(groupIntoProjects(metas)).toHaveLength(2);
  });
});

describe('extractSessionMeta', () => {
  it('ai-title을 제목으로 쓴다', () => {
    const metas = metasFrom('tests/fixtures/cjk-collision');
    expect(metas.map((m) => m.title)).toContain('임베디드 세션');
  });
});
