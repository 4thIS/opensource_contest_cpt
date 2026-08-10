import type { RawRecord } from '../reader/jsonl.js';
import type { Touch } from '../types.js';
import { normalizePath, pathKey } from '../resolver/paths.js';

export interface VersionEntry {
  version: number;
  backupFile: string | null;
  backupTime: string;
}

export interface FileTimeline {
  absPath: string;
  versions: VersionEntry[];
  touches: Touch[];
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

interface BackupLike { backupFileName?: unknown; version?: unknown; backupTime?: unknown }

function readBackup(v: unknown): { version: number; backupFile: string | null; backupTime: string } | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as BackupLike;
  if (typeof b.version !== 'number') return null;
  return {
    version: b.version,
    backupFile: typeof b.backupFileName === 'string' ? b.backupFileName : null,
    backupTime: typeof b.backupTime === 'string' ? b.backupTime : '',
  };
}

/** 스냅샷 키는 cwd 기준 상대경로이고 OS 구분자를 쓴다. */
function resolveSnapshotKey(key: string, launchCwd: string): string {
  const k = normalizePath(key);
  if (/^[A-Z]:\//.test(k) || k.startsWith('/')) return k;   // 이미 절대경로
  return normalizePath(`${launchCwd}/${k}`);
}

export function buildTimelines(
  records: RawRecord[],
  sessionId: string,
  launchCwd: string,
): FileTimeline[] {
  // pathKey → { absPath, versions: Map<version, VersionEntry>, touches }
  const files = new Map<string, {
    absPath: string;
    versions: Map<number, VersionEntry>;
    touches: Touch[];
  }>();

  function slot(absPath: string) {
    const key = pathKey(absPath);
    let s = files.get(key);
    if (!s) {
      s = { absPath: normalizePath(absPath), versions: new Map(), touches: [] };
      files.set(key, s);
    }
    return s;
  }

  function addVersion(absPath: string, entry: VersionEntry) {
    const s = slot(absPath);
    const prev = s.versions.get(entry.version);
    // 같은 버전이 중복되면 backupFile이 있는 쪽을 남긴다.
    if (!prev || (prev.backupFile === null && entry.backupFile !== null)) {
      s.versions.set(entry.version, entry);
    }
  }

  for (const r of records) {
    if (r.type === 'file-history-delta') {
      const p = typeof r.trackingPath === 'string' ? r.trackingPath : null;
      const b = readBackup(r.backup);
      if (p && b) addVersion(normalizePath(p), b);
      continue;
    }

    if (r.type === 'file-history-snapshot') {
      const snap = r.snapshot as { trackedFileBackups?: unknown } | undefined;
      const tracked = snap?.trackedFileBackups;
      if (tracked && typeof tracked === 'object') {
        for (const [key, val] of Object.entries(tracked as Record<string, unknown>)) {
          const b = readBackup(val);
          if (b) addVersion(resolveSnapshotKey(key, launchCwd), b);
        }
      }
      continue;
    }

    // 편집 툴콜 → touches
    const msg = r.message as { content?: unknown } | undefined;
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { type?: string; name?: string; input?: { file_path?: unknown } };
      if (b.type !== 'tool_use' || !b.name || !EDIT_TOOLS.has(b.name)) continue;
      const fp = b.input?.file_path;
      if (typeof fp !== 'string') continue;
      slot(normalizePath(fp)).touches.push({
        sessionId,
        messageId: typeof r.uuid === 'string' ? r.uuid : '',
        at: typeof r.timestamp === 'string' ? r.timestamp : '',
        tool: b.name as Touch['tool'],
      });
    }
  }

  return [...files.values()]
    .filter((f) => f.versions.size > 0 || f.touches.length > 0)
    .map((f) => ({
      absPath: f.absPath,
      versions: [...f.versions.values()].sort((a, b) => a.version - b.version),
      touches: f.touches,
    }));
}
