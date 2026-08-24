import { describe, it, expect } from 'vitest';
import { readSessionFile } from '../src/reader/jsonl.js';
import { listSessionFiles } from '../src/reader/discover.js';
import {
  extractSessionMeta, groupIntoProjects, dropResumedDuplicates,
} from '../src/resolver/projects.js';

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

// 실제 데이터 도그푸딩(Task 8.2)에서 나온 함정. 세션을 이어받으면(`--resume`)
// Claude Code 는 새 세션 파일에 이전 대화를 통째로 다시 적는다. 그대로 두면
// 같은 편집이 두 세션에 잡혀 세션 수·터치·버전 체인·토큰이 전부 두 배가 된다.
describe('이어받은 세션 중복', () => {
  const meta = (id: string, ids: string[], endedAt = '') =>
    ({ id, launchCwd: 'C:/w/proj', cwds: ['C:/w/proj'], messageIds: ids, endedAt } as never);

  it('uuid 집합이 다른 세션에 완전히 포함되면 버린다', () => {
    const kept = dropResumedDuplicates([
      meta('old', ['u1', 'a1'], '2026-07-24T01:01:00.000Z'),
      meta('new', ['u1', 'a1', 'a2'], '2026-07-24T01:30:00.000Z'),
    ]);
    expect(kept.map((m) => m.id)).toEqual(['new']);
  });

  it('겹치는 uuid가 있어도 부분집합이 아니면 둘 다 남긴다', () => {
    const kept = dropResumedDuplicates([
      meta('s1', ['u1', 'a1']),
      meta('s2', ['u1', 'a9']),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('완전히 같은 두 세션은 하나만, 순서와 무관하게 같은 쪽을 남긴다', () => {
    const a = meta('aaa', ['u1', 'a1']);
    const b = meta('bbb', ['u1', 'a1']);
    expect(dropResumedDuplicates([a, b]).map((m) => m.id)).toEqual(['aaa']);
    expect(dropResumedDuplicates([b, a]).map((m) => m.id)).toEqual(['aaa']);
  });

  it('uuid를 하나도 못 읽은 세션은 버리지 않는다 (빈 집합은 모든 집합의 부분집합)', () => {
    const kept = dropResumedDuplicates([
      meta('empty', []),
      meta('full', ['u1', 'a1']),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('픽스처: 이어받기 전 세션이 사라지고 이어받은 세션만 남는다', () => {
    const projects = groupIntoProjects(metasFrom('tests/fixtures/resumed-session'));
    expect(projects).toHaveLength(1);
    expect(projects[0]!.sessions.map((s) => s.title)).toEqual(['이어받은 세션']);
  });
});
