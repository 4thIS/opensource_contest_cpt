import { structuredPatch } from 'diff';
import type { DiffHunk } from '../types.js';

/** 앞 8KB 안에 NUL이 있으면 바이너리로 본다 (git과 같은 휴리스틱). */
export function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export function makeDiff(
  before: Buffer | null,
  after: Buffer | null,
  name: string,
): DiffHunk[] | null {
  if (before === null && after === null) return null;
  if (before && isBinary(before)) return null;
  if (after && isBinary(after)) return null;

  const a = before ? before.toString('utf8') : '';
  const b = after ? after.toString('utf8') : '';
  if (a === b) return [];

  const patch = structuredPatch(name, name, a, b, '', '', { context: 3 });
  return patch.hunks.map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines,
  }));
}

export function countLines(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.startsWith('+')) added++;
      else if (l.startsWith('-')) removed++;
    }
  }
  return { added, removed };
}
