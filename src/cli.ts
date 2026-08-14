import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { claudeHome, listSessionFiles } from './reader/discover.js';
import { readSessionFile, type RawRecord } from './reader/jsonl.js';
import { extractSessionMeta, groupIntoProjects } from './resolver/projects.js';
import { pathKey, normalizePath, isAncestor } from './resolver/paths.js';
import { auditProject } from './auditor/index.js';
import { redactReport } from './redact/secrets.js';
import { renderReport } from './renderer/render.js';
import type { AuditReport } from './types.js';
import { TOOL_VERSION } from './types.js';

export interface CliOptions {
  out: string;
  open: boolean;
  redact: boolean;
  transcript: boolean;
  since: string | null;
  home: string | null;
  color: boolean;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: false,
      options: {
        out: { type: 'string' },
        open: { type: 'boolean' },
        redact: { type: 'boolean' },
        'no-redact': { type: 'boolean' },
        'no-transcript': { type: 'boolean' },
        since: { type: 'string' },
        home: { type: 'string' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    });
  } catch {
    parsed = { values: {} as Record<string, unknown> };
  }
  const v = parsed.values as Record<string, unknown>;
  return {
    out: typeof v.out === 'string' ? v.out : 'ccaudit-report.html',
    open: v.open === true,
    redact: v['no-redact'] !== true,
    transcript: v['no-transcript'] !== true,
    since: typeof v.since === 'string' ? v.since : null,
    home: typeof v.home === 'string' ? v.home : null,
    color: v['no-color'] !== true,
    help: v.help === true,
  };
}

const HELP = `ccaudit ${TOOL_VERSION} — Claude Code가 이 저장소에 무엇을 했는지 감사합니다.

사용법:  npx ccaudit [옵션]

  --out <path>        출력 경로 (기본: ccaudit-report.html)
  --open              생성 후 브라우저로 엽니다
  --no-redact         시크릿 마스킹을 끕니다 (기본은 켜짐)
  --no-transcript     대화 본문을 제외해 가벼운 리포트를 만듭니다
  --since <YYYY-MM-DD> 해당 날짜 이후 세션만 포함합니다
  --home <path>       ~/.claude 위치를 직접 지정합니다
  --no-color          터미널 색상을 끕니다
  --help              이 도움말
`;

/**
 * cwd 가 속한 프로젝트를 고른다. 정확히 일치하는 것이 우선이고,
 * 없으면 **가장 가까운(경로가 가장 긴)** 조상 프로젝트를 고른다.
 * 먼저 발견된 조상을 쓰면 `C:/Users/x/work` 같은 먼 상위가 리포를 가로챈다.
 */
export function pickProject<T extends { root: string }>(
  projects: T[],
  cwd: string,
): T | undefined {
  const target = normalizePath(cwd);
  const exact = projects.find((p) => pathKey(p.root) === pathKey(target));
  if (exact) return exact;

  let best: T | undefined;
  for (const p of projects) {
    if (!isAncestor(p.root, target)) continue;
    if (!best || normalizePath(p.root).length > normalizePath(best.root).length) best = p;
  }
  return best;
}

export function runAudit(
  opts: CliOptions,
  cwd: string,
): { html: string; report: AuditReport } | { error: string } {
  const home = opts.home ?? claudeHome();
  if (!existsSync(home)) {
    return { error: `Claude Code 데이터 폴더를 찾을 수 없습니다: ${home}` };
  }

  const recordsBySession = new Map<string, RawRecord[]>();
  const metas = listSessionFiles(home).map((f) => {
    const parsed = readSessionFile(f.absPath);
    recordsBySession.set(f.sessionId, parsed.records);
    return extractSessionMeta(f.sessionId, parsed.records, {
      projectDir: f.projectDir,
      truncatedTail: parsed.truncatedTail,
    });
  });

  const filtered = opts.since
    ? metas.filter((m) => m.endedAt >= opts.since!)
    : metas;

  const projects = groupIntoProjects(filtered);
  const target = normalizePath(cwd);
  const project = pickProject(projects, target);

  if (!project) {
    return {
      error: `이 폴더에 해당하는 Claude Code 세션이 없습니다: ${target}\n` +
             `찾은 프로젝트: ${projects.map((p) => p.root).join(', ') || '(없음)'}`,
    };
  }

  let report = auditProject({
    home, project, recordsBySession, includeTranscript: opts.transcript,
  });
  if (opts.redact) report = redactReport(report);

  const assetDir = path.dirname(fileURLToPath(import.meta.url));
  const readAsset = (name: string): string => {
    try {
      return readFileSync(path.join(assetDir, name), 'utf8');
    } catch {
      return '';   // 개발 중(빌드 전)에는 빈 에셋으로도 렌더링은 된다
    }
  };

  return {
    html: renderReport(report, {
      js: readAsset('report-app.js'),
      css: readAsset('report.css'),
    }),
    report,
  };
}

function openInBrowser(file: string): void {
  const abs = path.resolve(file);
  const [cmd, args]: [string, string[]] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', abs]] :
    process.platform === 'darwin' ? ['open', [abs]] :
    ['xdg-open', [abs]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // 열기 실패는 치명적이지 않다 — 경로는 이미 출력했다.
  }
}

function main(): void {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  const result = runAudit(opts, process.cwd());
  if ('error' in result) {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(opts.out, result.html, 'utf8');

  const s = result.report.stats;
  process.stdout.write(`ccaudit: ${opts.out}\n`);
  process.stdout.write(
    `  세션 ${s.sessions} · 생성 ${s.created} · 수정 ${s.modified} · ` +
    `미커밋 ${s.uncommitted} · 유실 ${s.lost}` +
    (s.redacted > 0 ? ` · 마스킹 ${s.redacted}` : '') + '\n',
  );
  process.stdout.write(`  .gitignore 에 ${opts.out} 추가를 권장합니다.\n`);

  if (opts.open) openInBrowser(opts.out);
}

// 번들된 CLI로 직접 실행될 때만 main을 돌린다 (테스트에서는 import만 한다).
if (process.argv[1] && process.argv[1].endsWith('cli.js')) main();
