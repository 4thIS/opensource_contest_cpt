import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { loadVersion, loadCurrent, availabilityOf } from '../src/auditor/content.js';

const HOME = 'tests/fixtures/cjk-collision';
const SID = '11111111-1111-1111-1111-111111111111';

describe('loadVersion', () => {
  it('백업 파일이 있으면 내용을 읽는다', () => {
    const buf = loadVersion(HOME, SID, { version: 2, backupFile: 'aaaa1111@v2', backupTime: '' });
    expect(buf?.toString('utf8')).toContain('진행상황');
  });

  it('backupFile이 null이면 null을 준다', () => {
    expect(loadVersion(HOME, SID, { version: 1, backupFile: null, backupTime: '' })).toBeNull();
  });

  it('백업 파일이 사라졌으면 예외 대신 null을 준다', () => {
    expect(loadVersion(HOME, SID, { version: 9, backupFile: 'missing@v9', backupTime: '' })).toBeNull();
  });
});

describe('loadCurrent', () => {
  it('없는 파일은 null을 준다', () => {
    // 플랜 원문의 'C:/__missing__/x.md' 대신 tmpdir 기준 절대경로를 쓴다.
    // 'C:/...' 는 POSIX 에서 상대경로라 리포 안으로 resolve된다 — 결과는 같지만
    // "존재하지 않는 절대경로"라는 의도가 3-OS 에서 그대로 성립하지 않는다.
    const missing = path.join(os.tmpdir(), '__ccaudit_missing__', 'x.md');
    expect(loadCurrent(missing)).toBeNull();
  });
});

describe('availabilityOf', () => {
  it('모든 버전에 내용이 있으면 full', () => {
    expect(availabilityOf([
      { version: 1, backupFile: 'a@v1', backupTime: '' },
      { version: 2, backupFile: 'a@v2', backupTime: '' },
    ])).toBe('full');
  });

  it('일부만 있으면 partial', () => {
    expect(availabilityOf([
      { version: 1, backupFile: null, backupTime: '' },
      { version: 2, backupFile: 'a@v2', backupTime: '' },
    ])).toBe('partial');
  });

  it('하나도 없으면 none', () => {
    expect(availabilityOf([
      { version: 1, backupFile: null, backupTime: '' },
    ])).toBe('none');
  });

  it('버전이 아예 없으면 none', () => {
    expect(availabilityOf([])).toBe('none');
  });
});
