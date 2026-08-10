export type GitState =
  | 'committed' | 'uncommitted' | 'superseded' | 'lost' | 'unknown';
export type FileStatus = 'created' | 'modified' | 'deleted';
export type DiffAvailability = 'full' | 'partial' | 'none';

export interface TokenSum {
  input: number; output: number; cacheRead: number; cacheCreation: number;
}

export interface DiffHunk {
  oldStart: number; oldLines: number;
  newStart: number; newLines: number;
  lines: string[];              // '+' | '-' | ' ' 접두
}

export interface FileVersion {
  version: number;
  backupFile: string | null;    // null이면 백업 없음
  backupTime: string;
  sessionId: string;
  contentAvailable: boolean;    // backupFile === null이면 false
}

export interface Touch {
  sessionId: string;
  messageId: string;
  at: string;
  tool: 'Write' | 'Edit' | 'MultiEdit' | 'NotebookEdit' | 'Bash' | 'unknown';
}

export interface FileAudit {
  id: string;                   // 정규화된 absPath의 해시
  absPath: string;
  relPath: string | null;       // null = 프로젝트 외부
  status: FileStatus;
  gitState: GitState;
  versions: FileVersion[];
  touches: Touch[];
  diff: DiffHunk[] | null;
  diffAvailability: DiffAvailability;
}

export interface Message {
  uuid: string;
  role: 'user' | 'assistant';
  at: string;
  text: string;
  toolCalls: { name: string; summary: string }[];
}

export interface SessionSummary {
  id: string;
  title: string | null;
  startedAt: string; endedAt: string;
  launchCwd: string;
  cwds: string[];
  gitBranches: string[];
  ccVersion: string;
  model: string | null;
  counts: { user: number; assistant: number; tools: Record<string, number> };
  tokens: TokenSum;
  firstPrompt: string;
  fileIds: string[];
  messages?: Message[];
  inProgress: boolean;
}

export type WarningKind =
  | 'lost-change' | 'missing-backup' | 'external-write'
  | 'cwd-collision' | 'parse-error';

export interface Warning {
  kind: WarningKind;
  severity: 'high' | 'medium' | 'low';
  message: string;
  ref?: string;
}

export interface AuditReport {
  meta: { generatedAt: string; toolVersion: string; ccVersions: string[] };
  project: { root: string; displayName: string; isGitRepo: boolean };
  range: { from: string; to: string };
  stats: {
    sessions: number; created: number; modified: number; external: number;
    linesAdded: number; linesRemoved: number; uncommitted: number; lost: number;
    redacted: number;
    tokens: TokenSum;
  };
  files: FileAudit[];
  sessions: SessionSummary[];
  warnings: Warning[];
}

export const TOOL_VERSION = '0.1.0';

export function emptyTokenSum(): TokenSum {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

export function emptyReport(root: string, displayName: string): AuditReport {
  return {
    meta: { generatedAt: new Date().toISOString(), toolVersion: TOOL_VERSION, ccVersions: [] },
    project: { root, displayName, isGitRepo: false },
    range: { from: '', to: '' },
    stats: {
      sessions: 0, created: 0, modified: 0, external: 0,
      linesAdded: 0, linesRemoved: 0, uncommitted: 0, lost: 0, redacted: 0,
      tokens: emptyTokenSum(),
    },
    files: [], sessions: [], warnings: [],
  };
}
