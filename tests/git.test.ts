import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { blobHash, findGitRoot, findRepoForFile } from '../src/resolver/git.js';
import { normalizePath } from '../src/resolver/paths.js';

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

  it('시작 디렉터리가 없으면 상위로 올라가지 않는다', () => {
    // 이 경로의 상위에는 ccaudit 리포의 .git 이 있다. 그래도 null 이어야 한다 —
    // 존재하지 않는 cwd 는 "판정 불가"이지, 남의 저장소에 귀속시킬 근거가 아니다.
    // 다른 PC에서 기록된 세션의 cwd 가 로컬에 없을 때 실제로 이 경로를 탄다.
    expect(findGitRoot('tests/fixtures/__ccaudit_no_such_dir__')).toBeNull();
  });
});

// 도그푸딩(2026-08-14): 세션을 저장소 **부모**에서 띄우면 프로젝트 루트가 저장소가 아니라
// 전 파일이 '판정 불가'가 됐다. 판정 기준을 프로젝트가 아니라 파일별 저장소로 옮긴다.
// .git 은 존재 여부만 보므로 이 테스트들은 git 설치·실행이 필요 없다.
describe('findRepoForFile', () => {
  function tempTree(): { parent: string; repo: string; file: string } {
    const parent = mkdtempSync(path.join(OUTSIDE_REPO, 'ccaudit-nogit-'));
    const repo = path.join(parent, 'repo');
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    mkdirSync(path.join(repo, '.git'));
    const file = path.join(repo, 'src', 'a.ts');
    writeFileSync(file, 'x');
    return { parent, repo, file };
  }

  it('파일이 속한 저장소 루트와 그 기준 상대경로를 준다', () => {
    const { repo, file } = tempTree();
    const r = findRepoForFile(file);
    expect(r?.root).toBe(normalizePath(repo));
    expect(r?.relPath).toBe('src/a.ts');
  });

  it('프로젝트 루트가 저장소가 아니어도 하위 저장소의 파일은 판정한다', () => {
    const { parent, repo, file } = tempTree();
    expect(findGitRoot(parent)).toBeNull();          // 부모는 저장소가 아니다
    expect(findRepoForFile(file)?.root).toBe(normalizePath(repo));
  });

  it('저장소가 아니면 null', () => {
    const { parent } = tempTree();
    const outside = path.join(parent, 'b.md');
    writeFileSync(outside, 'x');
    expect(findRepoForFile(outside)).toBeNull();
  });

  it('존재하지 않는 경로는 null (상위로 올라가지 않는다)', () => {
    expect(findRepoForFile(path.join(OUTSIDE_REPO, '__missing__', 'x', 'y.md'))).toBeNull();
  });

  it('같은 디렉터리는 캐시를 재사용한다', () => {
    const { repo, file } = tempTree();
    const cache = new Map<string, string | null>();
    findRepoForFile(file, cache);
    findRepoForFile(path.join(repo, 'src', 'b.ts'), cache);
    expect(cache.size).toBe(1);
    expect([...cache.values()][0]).toBe(normalizePath(repo));
  });
});
