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
  messageIds: string[];       // 이어받기 중복 판정용 (대화 uuid 전부)
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
  const messageIds: string[] = [];
  const branches = new Set<string>();
  let launchCwd = '';
  let title: string | null = null;
  let ccVersion = '';
  let model: string | null = null;
  let startedAt = '';
  let endedAt = '';
  let firstPrompt = '';

  for (const r of records) {
    if (typeof r.uuid === 'string' && r.uuid) messageIds.push(r.uuid);

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
    messageIds,
  };
}

export interface Project {
  root: string;
  displayName: string;
  isGitRepo: boolean;
  sessions: SessionMeta[];
}

/**
 * 이어받기(resume)로 복제된 세션을 걷어낸다.
 *
 * 세션을 이어받으면 Claude Code 는 **새 세션 파일에 이전 대화를 통째로 다시 적는다**.
 * 두 파일 모두 그대로 세면 같은 편집이 두 번 잡혀 세션 수·터치·버전 체인·토큰이
 * 나란히 두 배가 된다(실제 데이터에서 확인: 290개 uuid가 통째로 겹쳤다).
 *
 * 판정은 대화 uuid 집합의 포함 관계로 한다. A ⊆ B 면 A 는 이어받기 전의 사본이다.
 * uuid 를 하나도 못 읽은 세션은 빈 집합이라 모든 집합의 부분집합이 되므로 제외한다 —
 * 파싱이 안 됐다는 이유로 세션을 통째로 지우면 안 된다.
 * 집합이 완전히 같으면 id 가 작은 쪽만 남겨 결과를 입력 순서와 무관하게 만든다.
 */
export function dropResumedDuplicates(metas: SessionMeta[]): SessionMeta[] {
  const sets = metas.map((m) => new Set(m.messageIds ?? []));

  return metas.filter((m, i) => {
    const mine = sets[i]!;
    if (mine.size === 0) return true;

    for (let j = 0; j < metas.length; j++) {
      if (j === i) continue;
      const other = sets[j]!;
      if (other.size < mine.size) continue;
      if (![...mine].every((id) => other.has(id))) continue;

      // 같은 크기 = 같은 집합. 결정적으로 한쪽만 남긴다.
      if (other.size === mine.size && metas[j]!.id > m.id) continue;
      return false;
    }
    return true;
  });
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

  // 중복 제거는 프로젝트 안에서만 한다. 이어받은 세션은 같은 폴더에서 이어지고,
  // 프로젝트를 넘나들며 비교하면 우연히 uuid 가 겹친 남의 세션까지 지운다.
  for (const proj of byKey.values()) {
    proj.sessions = dropResumedDuplicates(proj.sessions);
  }

  return [...byKey.values()].sort((a, b) => a.root.localeCompare(b.root));
}
