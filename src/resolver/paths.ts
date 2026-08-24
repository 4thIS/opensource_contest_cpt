import { createHash } from 'node:crypto';

/** 내부 표현: 구분자 '/', 드라이브 문자 대문자, 후행 슬래시 없음. */
export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, '/');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** 비교 전용 키. Windows·macOS 기본 파일시스템이 대소문자를 구분하지 않는다. */
export function pathKey(p: string): string {
  return normalizePath(p).toLowerCase();
}

export function isAncestor(parent: string, child: string): boolean {
  const a = pathKey(parent);
  const b = pathKey(child);
  if (a === b) return false;
  return b.startsWith(a.endsWith('/') ? a : `${a}/`);
}

/** 루트 기준 상대경로. 루트 밖이면 null. 루트 자신은 ''. */
export function relativeTo(root: string, target: string): string | null {
  const r = pathKey(root);
  const t = pathKey(target);
  if (r === t) return '';
  const prefix = r.endsWith('/') ? r : `${r}/`;
  if (!t.startsWith(prefix)) return null;
  return normalizePath(target).slice(prefix.length);
}

/** Windows 260자 제한 회피. 그 외 플랫폼에서는 그대로. */
export function longPath(p: string): string {
  if (process.platform !== 'win32') return p;
  if (p.length < 250 || p.startsWith('\\\\?\\')) return p;
  return `\\\\?\\${p.replace(/\//g, '\\')}`;
}

export function hashPath(p: string): string {
  return createHash('sha1').update(pathKey(p)).digest('hex').slice(0, 16);
}
