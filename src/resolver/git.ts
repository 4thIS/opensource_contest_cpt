import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath, relativeTo } from './paths.js';

/** git의 blob 오브젝트 해시. `blob <len>\0<content>` 의 SHA-1. */
export function blobHash(content: Buffer): string {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, content])).digest('hex');
}

function git(root: string, args: string[], input?: string): string | null {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      input,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    return null;   // git 미설치·저장소 아님·명령 실패 — 전부 조용히 null
  }
}

/**
 * 위로 올라가며 .git 을 찾는다. git 실행 없이 파일시스템만 본다.
 *
 * 시작 디렉터리가 존재하지 않으면 즉시 null 이다. 다른 PC에서 기록된 세션의 cwd 는
 * 로컬에 없는 것이 정상인데, 그때 상위로 올라가면 **이 프로그램이 실행 중인 저장소**를
 * 남의 프로젝트 루트로 잘못 집어낸다. 없는 경로는 "판정 불가"로 남긴다.
 */
export function findGitRoot(dir: string): string | null {
  if (!existsSync(dir)) return null;

  let cur = normalizePath(path.resolve(dir));
  for (let i = 0; i < 64; i++) {
    if (existsSync(path.join(cur, '.git'))) return cur;
    const parent = normalizePath(path.dirname(cur));
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

/**
 * 파일 **하나**가 속한 저장소와 그 저장소 기준 상대경로.
 *
 * 판정 기준을 프로젝트 루트가 아니라 파일에 두는 이유: 저장소의 **부모**에서 Claude 를
 * 띄우는 배치가 흔한데(예: `work/공모전/오픈소스` 에서 띄우고 저장소는 그 아래), 그때
 * 프로젝트 루트는 저장소가 아니라서 모든 파일이 '판정 불가'가 된다. 모노레포·중첩
 * 저장소도 같은 이유로 파일별 판정이 맞다.
 *
 * `cache` 는 디렉터리 → 루트 결과를 재사용한다(파일 수십 개가 같은 폴더에 몰린다).
 * 없는 경로는 `findGitRoot` 가 null 을 주므로 남의 저장소로 귀속되지 않는다.
 */
export function findRepoForFile(
  absPath: string,
  cache?: Map<string, string | null>,
): { root: string; relPath: string } | null {
  const dir = normalizePath(path.dirname(normalizePath(absPath)));

  let root = cache?.get(dir);
  if (root === undefined) {
    root = findGitRoot(dir);
    cache?.set(dir, root);
  }
  if (root === null) return null;

  const rel = relativeTo(root, absPath);
  if (rel === null || rel === '') return null;
  return { root, relPath: rel };
}

/**
 * 해당 경로가 git 히스토리에서 가졌던 모든 blob 해시.
 * git을 못 쓰면 null (= 판정 불가).
 */
export function listBlobHashesForPath(root: string, relPath: string): Set<string> | null {
  const commits = git(root, ['rev-list', '--all', '--', relPath]);
  if (commits === null) return null;

  const list = commits.split('\n').map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>();

  // 워킹트리에 스테이징된 버전도 포함해야 "커밋됨" 판정이 정확하다.
  const specs = [...list.map((c) => `${c}:${relPath}`), `:${relPath}`];
  if (specs.length === 0) return out;

  const res = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    `${specs.join('\n')}\n`);
  if (res === null) return out;

  for (const line of res.split('\n')) {
    const [name, type] = line.trim().split(/\s+/);
    if (type === 'blob' && name) out.add(name);
  }
  return out;
}
