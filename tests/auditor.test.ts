import { describe, it, expect } from 'vitest';
import { readSessionFile } from '../src/reader/jsonl.js';
import { listSessionFiles } from '../src/reader/discover.js';
import { extractSessionMeta, groupIntoProjects } from '../src/resolver/projects.js';
import { auditProject } from '../src/auditor/index.js';
import type { RawRecord } from '../src/reader/jsonl.js';

function auditAll(home: string) {
  const recordsBySession = new Map<string, RawRecord[]>();
  const metas = listSessionFiles(home).map((f) => {
    const parsed = readSessionFile(f.absPath);
    recordsBySession.set(f.sessionId, parsed.records);
    return extractSessionMeta(f.sessionId, parsed.records, {
      projectDir: f.projectDir, truncatedTail: parsed.truncatedTail,
    });
  });
  return groupIntoProjects(metas).map((project) =>
    auditProject({ home, project, recordsBySession, includeTranscript: true }),
  );
}

describe('auditProject — CJK 충돌 픽스처', () => {
  it('프로젝트마다 리포트를 하나씩 만든다', () => {
    expect(auditAll('tests/fixtures/cjk-collision')).toHaveLength(2);
  });

  // 스펙 7-5: status='deleted' 는 "백업 이력은 있으나 현재 디스크에 없음"이다.
  // 픽스처 경로(C:/Users/testuser/...)는 어느 머신에도 없으므로 deleted 가 맞다.
  // created/modified 판정은 실제 파일을 만드는 tests/status.test.ts 가 맡는다.
  it('임베디드 리포트에 진행상황.md가 프로젝트 소속으로 잡힌다', () => {
    const r = auditAll('tests/fixtures/cjk-collision')
      .find((x) => x.project.displayName === '임베디드')!;
    const f = r.files.find((x) => x.absPath.endsWith('진행상황.md'))!;
    expect(f.relPath).toBe('진행상황.md');
    expect(f.status).toBe('deleted');
  });

  it('오픈소스 리포트에 임베디드 파일이 섞이지 않는다', () => {
    const r = auditAll('tests/fixtures/cjk-collision')
      .find((x) => x.project.displayName === '오픈소스')!;
    expect(r.files.some((f) => f.absPath.includes('임베디드'))).toBe(false);
  });

  it('stats.sessions가 세션 수와 맞는다', () => {
    for (const r of auditAll('tests/fixtures/cjk-collision')) {
      expect(r.stats.sessions).toBe(r.sessions.length);
    }
  });
});

describe('auditProject — null-backup 픽스처', () => {
  it('백업이 일부만 있으면 diffAvailability가 partial', () => {
    const r = auditAll('tests/fixtures/null-backup')[0]!;
    expect(r.files.some((f) => f.diffAvailability === 'partial')).toBe(true);
  });

  it('백업 없는 버전에 missing-backup 경고를 남긴다', () => {
    const r = auditAll('tests/fixtures/null-backup')[0]!;
    expect(r.warnings.some((w) => w.kind === 'missing-backup')).toBe(true);
  });
});

describe('auditProject — no-git 픽스처', () => {
  it('git이 없으면 모든 gitState가 unknown', () => {
    const r = auditAll('tests/fixtures/no-git')[0]!;
    expect(r.files.every((f) => f.gitState === 'unknown')).toBe(true);
    expect(r.project.isGitRepo).toBe(false);
  });
});

describe('auditProject — in-progress 픽스처', () => {
  it('잘린 세션에 inProgress 표시가 붙는다', () => {
    const r = auditAll('tests/fixtures/in-progress')[0]!;
    expect(r.sessions.some((s) => s.inProgress)).toBe(true);
  });
});

describe('AuditReport 골든 스냅샷', () => {
  it('CJK 픽스처의 구조가 고정된다', () => {
    const reports = auditAll('tests/fixtures/cjk-collision')
      .map((r) => ({
        ...r,
        meta: { ...r.meta, generatedAt: 'FIXED' },   // 시간은 스냅샷에서 제외
      }));
    expect(reports).toMatchSnapshot();
  });
});
