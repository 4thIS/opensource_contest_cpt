import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath } from './paths.js';

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

/** 위로 올라가며 .git 을 찾는다. git 실행 없이 파일시스템만 본다. */
export function findGitRoot(dir: string): string | null {
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
