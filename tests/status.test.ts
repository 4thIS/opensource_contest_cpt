import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditProject } from '../src/auditor/index.js';
import { countLines } from '../src/auditor/diff.js';
import { normalizePath } from '../src/resolver/paths.js';
import type { RawRecord } from '../src/reader/jsonl.js';
import type { AuditReport } from '../src/types.js';
import type { Project, SessionMeta } from '../src/resolver/projects.js';

/**
 * 스펙 7-5의 status 3분기를 **디스크에 실재하는 파일**로 검증한다.
 *
 * 픽스처(tests/fixtures/*)의 경로는 익명화된 C:/Users/testuser/... 라 어느 머신에도
 * 없고, 따라서 전부 'deleted' 로만 판정된다. created/modified 경로는 여기서만 밟힌다.
 * 리포 안이 아니라 os.tmpdir() 을 쓰는 이유는 Task 3.2 의 교훈이다 —
 * 리포 안 경로는 findGitRoot 가 ccaudit 자신의 .git 을 집어 판정이 오염된다.
 */

const SID = '99999999-9999-9999-9999-999999999999';
const AT = '2026-08-12T00:00:00.000Z';

let tmp: string;
let home: string;
let root: string;
let report: AuditReport;

function delta(absPath: string, version: number, backupFileName: string | null): RawRecord {
  return {
    type: 'file-history-delta',
    trackingPath: absPath,
    backup: { backupFileName, version, backupTime: AT },
    timestamp: AT,
  };
}

function sessionMeta(): SessionMeta {
  return {
    id: SID,
    launchCwd: root,
    cwds: [root],
    gitBranches: [],
    ccVersion: '2.0.0',
    model: 'claude-opus-5',
    title: 'status 판정',
    startedAt: AT,
    endedAt: AT,
    firstPrompt: '',
    inProgress: false,
    projectDir: 'irrelevant',
  };
}

function fileOf(relPath: string) {
  return report.files.find((f) => f.relPath === relPath)!;
}

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'ccaudit-status-'));
  home = normalizePath(path.join(tmp, 'home'));
  root = normalizePath(path.join(tmp, 'proj'));
  mkdirSync(path.join(home, 'file-history', SID), { recursive: true });
  mkdirSync(root, { recursive: true });

  // 1) 생성: 디스크에 있고, v1 의 백업이 없다 (손대기 전 원본이 없었다).
  writeFileSync(path.join(root, 'created.md'), '새로 만든 줄\n', 'utf8');

  // 2) 수정: 디스크에 있고, v1 의 백업이 원본을 담고 있다.
  writeFileSync(path.join(home, 'file-history', SID, 'orig@v1'), '원본\n', 'utf8');
  writeFileSync(path.join(root, 'modified.md'), '원본\n덧붙인 줄\n', 'utf8');

  // 3) 삭제: 백업 이력만 있고 디스크에는 없다 (파일을 만들지 않는다).

  const records: RawRecord[] = [
    delta(`${root}/created.md`, 1, null),
    delta(`${root}/modified.md`, 1, 'orig@v1'),
    delta(`${root}/deleted.md`, 1, null),
  ];

  const project: Project = {
    root,
    displayName: path.basename(root),
    isGitRepo: false,
    sessions: [sessionMeta()],
  };

  report = auditProject({
    home,
    project,
    recordsBySession: new Map([[SID, records]]),
    includeTranscript: false,
  });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('status 판정 (스펙 7-5)', () => {
  it('디스크에 있고 v1 백업이 없으면 created', () => {
    expect(fileOf('created.md').status).toBe('created');
  });

  it('디스크에 있고 v1 백업이 있으면 modified', () => {
    expect(fileOf('modified.md').status).toBe('modified');
  });

  it('백업 이력만 있고 디스크에 없으면 deleted', () => {
    expect(fileOf('deleted.md').status).toBe('deleted');
  });

  it('stats 가 status 집계와 맞는다', () => {
    expect(report.stats.created).toBe(1);
    expect(report.stats.modified).toBe(1);
  });
});

describe('실제 파일 기반 diff', () => {
  it('원본 백업과 디스크 현재본을 비교해 추가된 줄을 낸다', () => {
    const f = fileOf('modified.md');
    expect(f.diff).not.toBeNull();
    expect(countLines(f.diff!)).toEqual({ added: 1, removed: 0 });
    expect(f.diffAvailability).toBe('full');
  });

  it('백업이 없으면 diffAvailability 가 none 이고 missing-backup 경고가 붙는다', () => {
    expect(fileOf('created.md').diffAvailability).toBe('none');
    expect(report.warnings.some((w) => w.kind === 'missing-backup')).toBe(true);
  });
});

describe('git 저장소가 아닐 때', () => {
  it('모든 gitState 가 unknown 이다', () => {
    expect(report.files.every((f) => f.gitState === 'unknown')).toBe(true);
  });
});
