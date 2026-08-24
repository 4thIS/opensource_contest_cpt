import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export class ClaudeHomeMissingError extends Error {
  constructor(public readonly tried: string) {
    super(`Claude Code 데이터 폴더를 찾을 수 없습니다: ${tried}`);
    this.name = 'ClaudeHomeMissingError';
  }
}

export function claudeHome(): string {
  const override = process.env.CCAUDIT_CLAUDE_HOME;
  if (override && override.length > 0) return path.resolve(override);
  return path.join(homedir(), '.claude');
}

export interface SessionFile {
  sessionId: string;
  absPath: string;
  projectDir: string;   // 인코딩된 폴더명 — 신뢰하지 않는다. 진단용으로만 보관.
}

export function listSessionFiles(home: string): SessionFile[] {
  const projectsRoot = path.join(home, 'projects');
  if (!existsSync(projectsRoot)) return [];

  const out: SessionFile[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(projectsRoot);
  } catch {
    return [];
  }

  for (const dir of dirs) {
    const dirAbs = path.join(projectsRoot, dir);
    try {
      if (!statSync(dirAbs).isDirectory()) continue;
      for (const entry of readdirSync(dirAbs)) {
        if (!entry.endsWith('.jsonl')) continue;
        out.push({
          sessionId: entry.slice(0, -'.jsonl'.length),
          absPath: path.join(dirAbs, entry),
          projectDir: dir,
        });
      }
    } catch {
      continue;   // 권한 거부 등 — 조용히 건너뛴다
    }
  }
  return out;
}
