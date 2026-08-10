import path from 'node:path';
import type { RawRecord } from '../reader/jsonl.js';
import { normalizePath, pathKey } from './paths.js';
import { findGitRoot } from './git.js';

export interface SessionMeta {
  id: string;
  launchCwd: string;          // 첫 메시지의 cwd — 소속 판정의 유일한 기준
  cwds: string[];             // 도중 이동 포함 전부
  gitBranches: string[];
  ccVersion: string;
  model: string | null;
  title: string | null;
  startedAt: string;
  endedAt: string;
  firstPrompt: string;
  inProgress: boolean;
  projectDir: string;         // 진단용. 판정에는 절대 쓰지 않는다.
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function firstText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const b of content) {
      if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
        const t = (b as { text?: unknown }).text;
        if (typeof t === 'string') return t;
      }
    }
  }
  return '';
}

export function extractSessionMeta(
  sessionId: string,
  records: RawRecord[],
  opts: { projectDir: string; truncatedTail: boolean },
): SessionMeta {
  const cwdSeen: string[] = [];
  const branches = new Set<string>();
  let launchCwd = '';
  let title: string | null = null;
  let ccVersion = '';
  let model: string | null = null;
  let startedAt = '';
  let endedAt = '';
  let firstPrompt = '';

  for (const r of records) {
    if (r.type === 'ai-title') {
      title = asString(r.aiTitle) ?? title;
      continue;
    }

    const cwd = asString(r.cwd);
    if (cwd) {
      const n = normalizePath(cwd);
      if (!cwdSeen.some((c) => pathKey(c) === pathKey(n))) cwdSeen.push(n);
      if (!launchCwd) launchCwd = n;      // 첫 등장이 실행 cwd
    }

    const branch = asString(r.gitBranch);
    if (branch) branches.add(branch);

    const ver = asString(r.version);
    if (ver) ccVersion = ver;

    const ts = asString(r.timestamp);
    if (ts) {
      if (!startedAt) startedAt = ts;
      endedAt = ts;
    }

    const msg = r.message as { role?: string; model?: string; content?: unknown } | undefined;
    if (msg) {
      if (msg.model) model = msg.model;
      if (r.type === 'user' && !firstPrompt) {
        firstPrompt = firstText(msg.content).slice(0, 200);
      }
    }
  }

  return {
    id: sessionId,
    launchCwd,
    cwds: cwdSeen,
    gitBranches: [...branches],
    ccVersion,
    model,
    title,
    startedAt,
    endedAt,
    firstPrompt,
    inProgress: opts.truncatedTail,
    projectDir: opts.projectDir,
  };
}

export interface Project {
  root: string;
  displayName: string;
  isGitRepo: boolean;
  sessions: SessionMeta[];
}

/**
 * 프로젝트 키 = 실행 cwd의 git 저장소 루트, 없으면 실행 cwd 그 자체.
 * 상위 폴더로의 병합은 하지 않는다 — 한 번이라도 상위에서 실행하면
 * 모든 프로젝트가 한 덩어리로 뭉치기 때문이다.
 */
export function groupIntoProjects(metas: SessionMeta[]): Project[] {
  const byKey = new Map<string, Project>();

  for (const m of metas) {
    if (!m.launchCwd) continue;
    const gitRoot = findGitRoot(m.launchCwd);
    const root = normalizePath(gitRoot ?? m.launchCwd);
    const key = pathKey(root);

    let proj = byKey.get(key);
    if (!proj) {
      proj = {
        root,
        displayName: path.basename(root) || root,
        isGitRepo: gitRoot !== null,
        sessions: [],
      };
      byKey.set(key, proj);
    }
    proj.sessions.push(m);
  }

  return [...byKey.values()].sort((a, b) => a.root.localeCompare(b.root));
}
