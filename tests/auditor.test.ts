import { describe, it, expect } from 'vitest';
import { readSessionFile } from '../src/reader/jsonl.js';
import { listSessionFiles } from '../src/reader/discover.js';
import { extractSessionMeta, groupIntoProjects } from '../src/resolver/projects.js';
import os from 'node:os';
import { normalizePath } from '../src/resolver/paths.js';
import {
  auditProject, shouldWarnMissingBackup, isAgentWorkspacePath,
} from '../src/auditor/index.js';
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

// 도그푸딩(2026-08-14): 실제 리포에서 missing-backup 경고 60건 중 대부분이
// "Claude 가 새로 만든 파일의 v1 에 이전 내용이 없다"는, 당연한 사실에 대한 경고였다.
// 표시(diffAvailability)는 스펙대로 정직하게 두고, 경고에서만 뺀다.
describe('shouldWarnMissingBackup', () => {
  const v = (version: number, backupFile: string | null) =>
    ({ version, backupFile, backupTime: '' });

  it('생성된 파일의 v1 백업 없음은 경고하지 않는다', () => {
    expect(shouldWarnMissingBackup('created', [v(1, null)])).toBe(false);
  });

  it('생성된 파일이라도 v1 이후 백업이 비면 경고한다', () => {
    expect(shouldWarnMissingBackup('created', [v(1, null), v(2, null)])).toBe(true);
  });

  it('생성된 파일의 나머지 버전에 백업이 다 있으면 경고하지 않는다', () => {
    expect(shouldWarnMissingBackup('created', [v(1, null), v(2, 'h@v2')])).toBe(false);
  });

  it('수정된 파일의 v1 백업 없음은 진짜 구멍이므로 경고한다', () => {
    expect(shouldWarnMissingBackup('modified', [v(1, null), v(2, 'h@v2')])).toBe(true);
  });

  it('백업이 전부 있으면 경고하지 않는다', () => {
    expect(shouldWarnMissingBackup('modified', [v(1, 'h@v1'), v(2, 'h@v2')])).toBe(false);
  });

  it('버전 자체가 하나도 없으면 경고한다 (복원 근거가 없다)', () => {
    expect(shouldWarnMissingBackup('deleted', [])).toBe(true);
  });
});

describe('auditProject — resumed-session 픽스처', () => {
  const report = () => auditAll('tests/fixtures/resumed-session')[0]!;

  it('이어받기로 중복된 세션을 두 번 세지 않는다', () => {
    expect(report().stats.sessions).toBe(1);
  });

  it('버전 체인이 v1·v2·v3 로 한 번씩만 잡힌다', () => {
    const f = report().files.find((x) => x.absPath.endsWith('app.ts'))!;
    expect(f.versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('같은 편집이 두 세션에 걸쳐 두 번 기록되지 않는다', () => {
    const f = report().files.find((x) => x.absPath.endsWith('app.ts'))!;
    expect(f.touches.map((t) => t.messageId)).toEqual(['a1', 'a2', 'a3']);
  });

  it('토큰 합계도 두 배가 되지 않는다', () => {
    expect(report().stats.tokens.input).toBe(10 + 11 + 12);
  });
});

// 도그푸딩(2026-08-21): 경고 13건 중 8건이 Claude Code 자신의 스크래치패드·세션 홈에
// 대한 쓰기였다. 도구가 자기 작업공간에 쓴 것을 "프로젝트 밖 파일 수정"이라고 경고하면
// 진짜 경고가 그 속에 묻힌다. 파일 목록에는 그대로 남기고 경고만 내리지 않는다.
describe('isAgentWorkspacePath', () => {
  const home = 'C:/Users/t/.claude';

  it('세션 홈 아래 파일은 도구의 작업공간이다', () => {
    expect(isAgentWorkspacePath('C:/Users/t/.claude/projects/p/memory/m.md', home)).toBe(true);
  });

  it('스크래치패드 아래 파일도 도구의 작업공간이다', () => {
    const p = `${normalizePath(os.tmpdir())}/claude/proj/sess/scratchpad/x.mjs`;
    expect(isAgentWorkspacePath(p, home)).toBe(true);
  });

  it('사용자 파일은 아니다', () => {
    expect(isAgentWorkspacePath('C:/Users/t/work/app/src/a.ts', home)).toBe(false);
  });

  it('이름만 비슷한 이웃 폴더에 걸리지 않는다', () => {
    expect(isAgentWorkspacePath('C:/Users/t/.claude-backup/x.md', home)).toBe(false);
    expect(isAgentWorkspacePath(`${normalizePath(os.tmpdir())}/claudex/x.mjs`, home)).toBe(false);
  });
});
