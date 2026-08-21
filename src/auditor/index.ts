import type { RawRecord } from '../reader/jsonl.js';
import type {
  AuditReport, FileAudit, FileVersion, SessionSummary, TokenSum, Warning, Message,
} from '../types.js';
import { emptyReport, emptyTokenSum } from '../types.js';
import type { Project, SessionMeta } from '../resolver/projects.js';
import os from 'node:os';
import path from 'node:path';
import { hashPath, relativeTo, normalizePath, isAncestor } from '../resolver/paths.js';
import { listBlobHashesForPath, findRepoForFile, isIgnored } from '../resolver/git.js';
import { buildTimelines, type VersionEntry } from './timeline.js';
import { loadVersion, loadCurrent, availabilityOf } from './content.js';
import { makeDiff, countLines } from './diff.js';
import { classify } from './gitstate.js';

interface Accum {
  absPath: string;
  versionsBySession: { sessionId: string; versions: VersionEntry[]; endedAt: string }[];
  touches: FileAudit['touches'];
}

function sumTokens(records: RawRecord[]): TokenSum {
  const t = emptyTokenSum();
  for (const r of records) {
    const msg = r.message as { usage?: Record<string, unknown> } | undefined;
    const u = msg?.usage;
    if (!u) continue;
    t.input += Number(u.input_tokens ?? 0);
    t.output += Number(u.output_tokens ?? 0);
    t.cacheRead += Number(u.cache_read_input_tokens ?? 0);
    t.cacheCreation += Number(u.cache_creation_input_tokens ?? 0);
  }
  return t;
}

function collectMessages(records: RawRecord[]): Message[] {
  const out: Message[] = [];
  for (const r of records) {
    if (r.type !== 'user' && r.type !== 'assistant') continue;
    const msg = r.message as { role?: string; content?: unknown } | undefined;
    if (!msg) continue;
    let text = '';
    const toolCalls: Message['toolCalls'] = [];
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (!b || typeof b !== 'object') continue;
        const blk = b as { type?: string; text?: string; name?: string; input?: unknown };
        if (blk.type === 'text' && blk.text) text += blk.text;
        if (blk.type === 'tool_use' && blk.name) {
          const inp = blk.input as { file_path?: string; command?: string } | undefined;
          toolCalls.push({
            name: blk.name,
            summary: inp?.file_path ?? inp?.command ?? '',
          });
        }
      }
    }
    out.push({
      uuid: typeof r.uuid === 'string' ? r.uuid : '',
      role: r.type === 'user' ? 'user' : 'assistant',
      at: typeof r.timestamp === 'string' ? r.timestamp : '',
      text,
      toolCalls,
    });
  }
  return out;
}

function countTools(records: RawRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    const msg = r.message as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) continue;
    for (const b of msg.content) {
      const blk = b as { type?: string; name?: string };
      if (blk?.type === 'tool_use' && blk.name) out[blk.name] = (out[blk.name] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * 백업 구멍을 **경고**로 띄울지 판단한다.
 *
 * 생성된 파일의 v1 에 백업이 없는 것은 구멍이 아니라 정의상 당연한 일이다(생성 전 내용이
 * 없으니까). 이걸 경고하면 실제 리포에서 경고의 대부분이 이 항목으로 채워져 진짜 문제
 * (유실·복원 불가)가 묻힌다. 표시용 `diffAvailability` 는 스펙 7-3 대로 손대지 않는다 —
 * "없는 것을 있는 것처럼 표시하지 않는다".
 */
export function shouldWarnMissingBackup(
  status: FileAudit['status'],
  versions: VersionEntry[],
): boolean {
  if (versions.length === 0) return true;   // 복원 근거가 아예 없다
  const suspect = status === 'created' ? versions.slice(1) : versions;
  return suspect.some((v) => v.backupFile === null);
}

/**
 * Claude Code 자신의 작업공간인가 (세션 홈 `~/.claude`, 스크래치패드 `<tmp>/claude/…`).
 *
 * 도구가 자기 폴더에 쓴 것을 "프로젝트 밖 파일 수정"으로 경고하면 실제 리포에서
 * 경고의 대부분이 그것으로 채워진다(도그푸딩: 13건 중 8건). 파일 목록에는 그대로
 * 남겨 감추지 않고, **경고만** 내리지 않는다.
 */
export function isAgentWorkspacePath(absPath: string, home: string): boolean {
  if (isAncestor(home, absPath)) return true;
  return isAncestor(normalizePath(path.join(os.tmpdir(), 'claude')), absPath);
}

export function auditProject(args: {
  home: string;
  project: Project;
  recordsBySession: Map<string, RawRecord[]>;
  includeTranscript: boolean;
}): AuditReport {
  const { home, project, recordsBySession, includeTranscript } = args;
  const report = emptyReport(project.root, project.displayName);
  report.project.isGitRepo = project.isGitRepo;

  const warnings: Warning[] = [];
  const gitRootCache = new Map<string, string | null>();   // 디렉터리 → 저장소 루트
  const accums = new Map<string, Accum>();
  const ccVersions = new Set<string>();
  const sessions: SessionSummary[] = [];

  // 세션을 시간순으로 — "가장 최근 세션의 최종본"이 기준선이므로 순서가 중요하다.
  const ordered = [...project.sessions].sort(
    (a: SessionMeta, b: SessionMeta) => a.endedAt.localeCompare(b.endedAt),
  );

  for (const meta of ordered) {
    const records = recordsBySession.get(meta.id) ?? [];
    if (meta.ccVersion) ccVersions.add(meta.ccVersion);

    const timelines = buildTimelines(records, meta.id, meta.launchCwd);
    const fileIds: string[] = [];

    for (const tl of timelines) {
      const id = hashPath(tl.absPath);
      fileIds.push(id);
      let acc = accums.get(id);
      if (!acc) {
        acc = { absPath: tl.absPath, versionsBySession: [], touches: [] };
        accums.set(id, acc);
      }
      if (tl.versions.length > 0) {
        acc.versionsBySession.push({
          sessionId: meta.id, versions: tl.versions, endedAt: meta.endedAt,
        });
      }
      acc.touches.push(...tl.touches);
    }

    sessions.push({
      id: meta.id,
      title: meta.title,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      launchCwd: meta.launchCwd,
      cwds: meta.cwds,
      gitBranches: meta.gitBranches,
      ccVersion: meta.ccVersion,
      model: meta.model,
      counts: {
        user: records.filter((r) => r.type === 'user').length,
        assistant: records.filter((r) => r.type === 'assistant').length,
        tools: countTools(records),
      },
      tokens: sumTokens(records),
      firstPrompt: meta.firstPrompt,
      fileIds: [...new Set(fileIds)],
      ...(includeTranscript ? { messages: collectMessages(records) } : {}),
      inProgress: meta.inProgress,
    });
  }

  // 파일별 감사
  const files: FileAudit[] = [];
  for (const [id, acc] of accums) {
    const allVersions: FileVersion[] = [];
    for (const g of acc.versionsBySession) {
      for (const v of g.versions) {
        allVersions.push({
          version: v.version,
          backupFile: v.backupFile,
          backupTime: v.backupTime,
          sessionId: g.sessionId,
          contentAvailable: v.backupFile !== null,
        });
      }
    }

    const relPath = relativeTo(project.root, acc.absPath);
    const firstGroup = acc.versionsBySession[0];
    const firstVersion = firstGroup?.versions[0];
    const currentContent = loadCurrent(acc.absPath);

    // status: 최초 버전이 v1 + 백업 없음 → 생성. 디스크에 없으면 삭제.
    let status: FileAudit['status'];
    if (currentContent === null) status = 'deleted';
    else if (firstVersion && firstVersion.version === 1 && firstVersion.backupFile === null) {
      status = 'created';
    } else status = 'modified';

    // 기준선: 가장 최근 세션의 최종본
    const lastGroup = acc.versionsBySession[acc.versionsBySession.length - 1];
    let finalContent: Buffer | null = null;
    if (lastGroup) {
      for (let i = lastGroup.versions.length - 1; i >= 0 && finalContent === null; i--) {
        finalContent = loadVersion(home, lastGroup.sessionId, lastGroup.versions[i]!);
      }
    }

    // 원본: 첫 세션 v1의 백업 (생성이면 원본 없음)
    let originalContent: Buffer | null = null;
    if (firstGroup && firstVersion && firstVersion.backupFile !== null) {
      originalContent = loadVersion(home, firstGroup.sessionId, firstVersion);
    }

    // 판정은 **파일이 속한 저장소** 기준이다. 프로젝트 루트가 저장소가 아니어도
    // (저장소 부모에서 Claude 를 띄운 경우) 파일별로는 커밋 여부를 알 수 있다.
    const repo = findRepoForFile(acc.absPath, gitRootCache);
    const gitBlobs = repo ? listBlobHashesForPath(repo.root, repo.relPath) : null;

    // 무시되는 파일은 커밋된 적이 없으니 blob 이 하나도 없다. 그 경우에만 확인해
    // 파일당 프로세스 하나를 더 띄우는 비용을 아낀다.
    const ignored = repo !== null && gitBlobs !== null && gitBlobs.size === 0
      && isIgnored(repo.root, repo.relPath);

    const gitState = classify({ finalContent, currentContent, gitBlobs, ignored });
    const diff = makeDiff(originalContent, currentContent, relPath ?? acc.absPath);
    const availability = availabilityOf(
      acc.versionsBySession.flatMap((g) => g.versions),
    );

    const agentOwned = isAgentWorkspacePath(acc.absPath, home);

    const holes = shouldWarnMissingBackup(status, acc.versionsBySession.flatMap((g) => g.versions));

    if (!agentOwned && holes) {
      warnings.push({
        kind: 'missing-backup',
        severity: 'low',
        message: `${relPath ?? acc.absPath}: 일부 버전의 백업이 없어 전체 복원이 불가합니다.`,
        ref: id,
      });
    }
    // 유실은 도구의 작업공간이라도 알린다 — 없어진 내용은 어디에 있었든 정보다.
    if (gitState === 'lost') {
      warnings.push({
        kind: 'lost-change',
        severity: 'high',
        message: `${relPath ?? acc.absPath}: 세션의 최종 결과물이 디스크에도 git에도 없습니다.`,
        ref: id,
      });
    }
    if (relPath === null && !agentOwned) {
      warnings.push({
        kind: 'external-write',
        severity: 'medium',
        message: `${acc.absPath}: 프로젝트 밖 파일이 수정되었습니다.`,
        ref: id,
      });
    }

    files.push({
      id,
      absPath: acc.absPath,
      relPath,
      status,
      gitState,
      versions: allVersions,
      touches: acc.touches,
      diff,
      diffAvailability: availability,
    });
  }

  files.sort((a, b) => (a.relPath ?? '￿').localeCompare(b.relPath ?? '￿'));

  // 통계
  const tokens = emptyTokenSum();
  for (const s of sessions) {
    tokens.input += s.tokens.input;
    tokens.output += s.tokens.output;
    tokens.cacheRead += s.tokens.cacheRead;
    tokens.cacheCreation += s.tokens.cacheCreation;
  }
  let added = 0;
  let removed = 0;
  for (const f of files) {
    if (!f.diff) continue;
    const c = countLines(f.diff);
    added += c.added;
    removed += c.removed;
  }

  report.meta.ccVersions = [...ccVersions];
  report.sessions = sessions;
  report.files = files;
  report.warnings = warnings;
  report.range = {
    from: sessions[0]?.startedAt ?? '',
    to: sessions[sessions.length - 1]?.endedAt ?? '',
  };
  report.stats = {
    sessions: sessions.length,
    created: files.filter((f) => f.status === 'created').length,
    modified: files.filter((f) => f.status === 'modified').length,
    external: files.filter((f) => f.relPath === null).length,
    linesAdded: added,
    linesRemoved: removed,
    uncommitted: files.filter((f) => f.gitState === 'uncommitted').length,
    lost: files.filter((f) => f.gitState === 'lost').length,
    redacted: 0,     // Task 5.1에서 채운다
    tokens,
  };
  report.project.root = normalizePath(project.root);
  return report;
}
