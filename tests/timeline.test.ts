import { describe, it, expect } from 'vitest';
import { buildTimelines } from '../src/auditor/timeline.js';
import type { RawRecord } from '../src/reader/jsonl.js';

const CWD = 'C:/w/proj';

function delta(p: string, version: number, backupFile: string | null): RawRecord {
  return {
    type: 'file-history-delta',
    messageId: 'm1',
    trackingPath: p,
    backup: { backupFileName: backupFile, version, backupTime: '2026-07-20T00:00:00.000Z' },
    timestamp: '2026-07-20T00:00:00.000Z',
  };
}

function snapshot(entries: Record<string, { backupFileName: string | null; version: number }>): RawRecord {
  const tracked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entries)) {
    tracked[k] = { ...v, backupTime: '2026-07-20T00:01:00.000Z' };
  }
  return {
    type: 'file-history-snapshot',
    messageId: 'm2',
    snapshot: { messageId: 'm2', trackedFileBackups: tracked, timestamp: '2026-07-20T00:01:00.000Z' },
  };
}

describe('buildTimelines', () => {
  it('델타 하나만 있어도 파일 하나를 만든다', () => {
    const t = buildTimelines([delta('C:\\w\\proj\\a.md', 1, null)], 's1', CWD);
    expect(t).toHaveLength(1);
    expect(t[0]!.absPath).toBe('C:/w/proj/a.md');
    expect(t[0]!.versions).toEqual([
      { version: 1, backupFile: null, backupTime: '2026-07-20T00:00:00.000Z' },
    ]);
  });

  it('스냅샷의 상대경로 키를 cwd 기준 절대경로로 푼다', () => {
    const t = buildTimelines([snapshot({ 'sub\\b.md': { backupFileName: 'h1@v2', version: 2 } })], 's1', CWD);
    expect(t[0]!.absPath).toBe('C:/w/proj/sub/b.md');
  });

  it('델타와 스냅샷을 하나의 버전 체인으로 병합한다', () => {
    const t = buildTimelines([
      delta('C:\\w\\proj\\a.md', 1, null),
      snapshot({ 'a.md': { backupFileName: 'h1@v2', version: 2 } }),
      snapshot({ 'a.md': { backupFileName: 'h1@v3', version: 3 } }),
    ], 's1', CWD);
    expect(t).toHaveLength(1);
    expect(t[0]!.versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('같은 버전이 중복되면 backupFile이 있는 쪽을 남긴다', () => {
    const t = buildTimelines([
      delta('C:\\w\\proj\\a.md', 1, null),
      snapshot({ 'a.md': { backupFileName: 'h1@v1', version: 1 } }),
    ], 's1', CWD);
    expect(t[0]!.versions).toHaveLength(1);
    expect(t[0]!.versions[0]!.backupFile).toBe('h1@v1');
  });

  it('null 백업이 섞여도 버전을 빠뜨리지 않는다', () => {
    const t = buildTimelines([
      delta('C:\\w\\proj\\a.md', 1, null),
      snapshot({ 'a.md': { backupFileName: 'h1@v2', version: 2 } }),
      snapshot({ 'a.md': { backupFileName: null, version: 3 } }),
    ], 's1', CWD);
    expect(t[0]!.versions.map((v) => [v.version, v.backupFile])).toEqual([
      [1, null], [2, 'h1@v2'], [3, null],
    ]);
  });

  it('버전을 오름차순으로 정렬한다', () => {
    const t = buildTimelines([
      snapshot({ 'a.md': { backupFileName: 'h@v3', version: 3 } }),
      snapshot({ 'a.md': { backupFileName: 'h@v2', version: 2 } }),
    ], 's1', CWD);
    expect(t[0]!.versions.map((v) => v.version)).toEqual([2, 3]);
  });

  it('편집 툴콜을 touches로 모은다', () => {
    const rec: RawRecord = {
      type: 'assistant', uuid: 'a1', timestamp: '2026-07-20T00:02:00.000Z',
      message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: 'C:/w/proj/a.md' } },
      ] },
    };
    const t = buildTimelines([delta('C:\\w\\proj\\a.md', 1, null), rec], 's1', CWD);
    expect(t[0]!.touches).toHaveLength(1);
    expect(t[0]!.touches[0]!.tool).toBe('Edit');
    expect(t[0]!.touches[0]!.sessionId).toBe('s1');
  });

  it('경로 대소문자만 다른 항목을 같은 파일로 본다', () => {
    const t = buildTimelines([
      delta('C:\\w\\proj\\A.md', 1, null),
      snapshot({ 'a.md': { backupFileName: 'h@v2', version: 2 } }),
    ], 's1', CWD);
    expect(t).toHaveLength(1);
  });

  it('알 수 없는 레코드는 조용히 무시한다', () => {
    expect(buildTimelines([{ type: 'mode', mode: 'normal' }], 's1', CWD)).toEqual([]);
  });
});
