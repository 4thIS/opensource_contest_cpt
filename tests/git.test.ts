import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { blobHash, findGitRoot } from '../src/resolver/git.js';

// 플랜 원문은 'tests/fixtures/no-git' 과 'C:/__definitely__/__missing__' 을 썼으나
// 둘 다 3-OS에서 성립하지 않는다:
//   - 픽스처는 ccaudit 리포 안에 있어 findGitRoot가 위로 올라가다 리포의 .git 을 만난다.
//   - 'C:/...' 는 Linux/macOS에서 절대경로가 아니라 상대경로라 역시 리포 안으로 resolve된다.
// 리포 밖의 진짜 절대경로가 필요하므로 os.tmpdir() 을 기준으로 삼는다.
const OUTSIDE_REPO = os.tmpdir();

describe('blobHash', () => {
  it('빈 파일의 git blob 해시는 알려진 상수다', () => {
    expect(blobHash(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  it('"hello\\n"의 blob 해시는 알려진 상수다', () => {
    expect(blobHash(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });

  it('내용이 다르면 해시가 다르다', () => {
    expect(blobHash(Buffer.from('a'))).not.toBe(blobHash(Buffer.from('b')));
  });
});

describe('findGitRoot', () => {
  it('git 저장소가 아니면 null을 준다', () => {
    expect(findGitRoot(OUTSIDE_REPO)).toBeNull();
  });

  it('존재하지 않는 경로도 null을 준다 (예외를 던지지 않는다)', () => {
    expect(findGitRoot(path.join(OUTSIDE_REPO, '__ccaudit_definitely_missing__'))).toBeNull();
  });
});
