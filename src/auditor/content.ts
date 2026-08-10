import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DiffAvailability } from '../types.js';
import type { VersionEntry } from './timeline.js';
import { longPath } from '../resolver/paths.js';

export function backupAbsPath(home: string, sessionId: string, backupFile: string): string {
  return path.join(home, 'file-history', sessionId, backupFile);
}

export function loadVersion(
  home: string, sessionId: string, v: VersionEntry,
): Buffer | null {
  if (!v.backupFile) return null;
  try {
    return readFileSync(longPath(backupAbsPath(home, sessionId, v.backupFile)));
  } catch {
    return null;    // 백업이 정리됐거나 권한 거부 — 조용히 없음 처리
  }
}

export function loadCurrent(absPath: string): Buffer | null {
  try {
    return readFileSync(longPath(absPath));
  } catch {
    return null;    // 삭제됐거나 접근 불가
  }
}

export function availabilityOf(versions: VersionEntry[]): DiffAvailability {
  if (versions.length === 0) return 'none';
  const withContent = versions.filter((v) => v.backupFile !== null).length;
  if (withContent === 0) return 'none';
  if (withContent === versions.length) return 'full';
  return 'partial';
}
