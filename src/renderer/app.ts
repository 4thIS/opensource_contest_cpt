import type { AuditReport, FileAudit, GitState, SessionSummary } from '../types.js';

const EXTERNAL_GROUP = '(프로젝트 외부)';

export function matchesFile(f: FileAudit, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (f.relPath ?? f.absPath).toLowerCase().includes(needle);
}

export function matchesSession(s: SessionSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    (s.title ?? '').toLowerCase().includes(needle) ||
    s.firstPrompt.toLowerCase().includes(needle) ||
    s.id.toLowerCase().includes(needle)
  );
}

export function stateLabel(g: GitState): { text: string; cls: string } {
  switch (g) {
    case 'committed': return { text: '커밋됨', cls: 'ok' };
    case 'uncommitted': return { text: '미커밋', cls: 'warn' };
    case 'superseded': return { text: '이후 변경됨', cls: 'muted' };
    case 'lost': return { text: '유실', cls: 'bad' };
    default: return { text: '판정 불가', cls: 'muted' };
  }
}

export function groupByDir(files: FileAudit[]): { dir: string; files: FileAudit[] }[] {
  const groups = new Map<string, FileAudit[]>();
  for (const f of files) {
    let dir: string;
    if (f.relPath === null) dir = EXTERNAL_GROUP;
    else {
      const i = f.relPath.lastIndexOf('/');
      dir = i === -1 ? '.' : f.relPath.slice(0, i);
    }
    const arr = groups.get(dir);
    if (arr) arr.push(f);
    else groups.set(dir, [f]);
  }
  const out = [...groups.entries()].map(([dir, list]) => ({ dir, files: list }));
  out.sort((a, b) => {
    if (a.dir === EXTERNAL_GROUP) return 1;
    if (b.dir === EXTERNAL_GROUP) return -1;
    return a.dir.localeCompare(b.dir);
  });
  return out;
}

// ---- DOM 부트스트랩 (얇게 유지) ----

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderDiff(f: FileAudit): HTMLElement {
  const box = el('pre', 'diff');
  if (!f.diff) {
    box.append(el('span', 'muted', '(diff 없음 — 바이너리이거나 백업이 없습니다)'));
    return box;
  }
  for (const h of f.diff) {
    box.append(el('div', 'hunk', `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`));
    for (const line of h.lines) {
      const cls = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
      box.append(el('div', cls, line));
    }
  }
  return box;
}

function renderFiles(report: AuditReport, q: string): HTMLElement {
  const wrap = el('div');
  const visible = report.files.filter((f) => matchesFile(f, q));
  if (visible.length === 0) {
    wrap.append(el('p', 'muted', '일치하는 파일이 없습니다.'));
    return wrap;
  }
  for (const group of groupByDir(visible)) {
    wrap.append(el('h2', 'dir', group.dir));
    for (const f of group.files) {
      const row = el('details', 'file');
      const sum = el('summary');
      sum.append(el('span', 'name', f.relPath ?? f.absPath));
      sum.append(el('span', 'status', f.status === 'created' ? '생성'
        : f.status === 'deleted' ? '삭제' : '수정'));
      const st = stateLabel(f.gitState);
      sum.append(el('span', `badge ${st.cls}`, st.text));
      sum.append(el('span', 'muted', `${f.touches.length}회 · v${f.versions.length}`));
      if (f.diffAvailability !== 'full') {
        sum.append(el('span', 'badge muted', '복원 불완전'));
      }
      row.append(sum, renderDiff(f));
      wrap.append(row);
    }
  }
  return wrap;
}

function renderSessions(report: AuditReport, q: string): HTMLElement {
  const wrap = el('div');
  for (const s of report.sessions.filter((x) => matchesSession(x, q))) {
    const row = el('details', 'session');
    const sum = el('summary');
    sum.append(el('span', 'name', s.title ?? '(제목 없음)'));
    sum.append(el('span', 'muted', `${s.startedAt.slice(0, 16).replace('T', ' ')}`));
    sum.append(el('span', 'muted', `파일 ${s.fileIds.length} · 토큰 ${s.tokens.input + s.tokens.output}`));
    if (s.inProgress) sum.append(el('span', 'badge warn', '진행 중'));
    row.append(sum);
    row.append(el('p', 'muted', `cwd: ${s.cwds.join(' → ')}`));
    for (const m of s.messages ?? []) {
      const b = el('div', `msg ${m.role}`);
      b.append(el('div', 'role', m.role === 'user' ? '사용자' : 'Claude'));
      b.append(el('div', 'text', m.text.slice(0, 4000)));
      for (const t of m.toolCalls) b.append(el('div', 'tool', `⚙ ${t.name} ${t.summary}`));
      row.append(b);
    }
    wrap.append(row);
  }
  return wrap;
}

function renderWarnings(report: AuditReport): HTMLElement {
  const wrap = el('div');
  if (report.warnings.length === 0) {
    wrap.append(el('p', 'muted', '경고 없음.'));
    return wrap;
  }
  for (const w of report.warnings) {
    const row = el('div', `warning ${w.severity}`);
    row.append(el('span', 'badge', w.kind));
    row.append(el('span', '', w.message));
    wrap.append(row);
  }
  return wrap;
}

export function mount(): void {
  const raw = document.getElementById('ccaudit-data')?.textContent ?? '{}';
  const report = JSON.parse(raw) as AuditReport;

  const q = document.getElementById('q') as HTMLInputElement | null;
  const panes: Record<string, HTMLElement | null> = {
    files: document.getElementById('tab-files'),
    sessions: document.getElementById('tab-sessions'),
    warnings: document.getElementById('tab-warnings'),
  };

  function paint() {
    const query = q?.value.trim() ?? '';
    if (panes.files) panes.files.replaceChildren(renderFiles(report, query));
    if (panes.sessions) panes.sessions.replaceChildren(renderSessions(report, query));
    if (panes.warnings) panes.warnings.replaceChildren(renderWarnings(report));
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('.tabs button')) b.classList.remove('active');
      for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  }

  q?.addEventListener('input', paint);
  paint();
}

if (typeof document !== 'undefined') mount();
