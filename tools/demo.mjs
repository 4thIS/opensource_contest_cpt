/**
 * 데모용 `~/.claude` 홈과 저장소를 통째로 만들어낸다.
 *
 * 스크린샷·시연영상에 실제 세션을 쓰면 실제 경로·대화·파일 내용이 그대로 공개된다.
 * 그렇다고 손으로 그린 화면을 보여주면 그건 도구의 출력이 아니다. 그래서 **입력을
 * 합성해** 진짜 파이프라인을 통과시킨다. git 4분류가 한 화면에 다 나오도록 커밋
 * 순서까지 재현한다 — 특히 `유실`은 재현이 까다로워 시연 때마다 문제였다.
 *
 * 사용:
 *   node tools/demo.mjs [--dir <경로>]
 *   node dist/cli.js --home <경로>/.claude --out demo.html
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argDir = process.argv.indexOf('--dir');
const ROOT = argDir === -1 ? path.join(os.tmpdir(), 'ccaudit-demo') : process.argv[argDir + 1];
const HOME = path.join(ROOT, '.claude');
const REPO = path.join(ROOT, '할일앱');
const S1 = '11111111-2222-3333-4444-555555555555';
const S2 = '66666666-7777-8888-9999-000000000000';
// Claude Code 가 비ASCII 를 '-' 하나로 뭉갠 그 폴더명. ccaudit 은 이 이름을 믿지 않는다.
const PROJECT_DIR = 'C--ccaudit-demo----';

// 델타 레코드가 어느 세션 파일에 들어가는지 (messageId → 세션)
const OWNER = { a1: S1, a2: S1, a3: S1, a4: S2, a5: S2, a6: S2, a7: S2, a8: S2 };

const git = (...args) =>
  execFileSync('git', ['-C', REPO, ...args], { stdio: 'ignore', windowsHide: true });

function w(rel, text) {
  const abs = path.join(REPO, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text, 'utf8');
}

function backup(sid, name, text) {
  const dir = path.join(HOME, 'file-history', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), text, 'utf8');
}

const README_0 = '# 할일앱\n\n할 일을 기록하는 작은 앱.\n';
const README_CLAUDE = `${README_0}\n## 설치\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`;
const README_HUMAN = `${README_CLAUDE}\n## 라이선스\n\nMIT\n`;
const TODO_1 = 'export interface 할일 {\n  id: string;\n  제목: string;\n}\n';
const TODO_2 = `export interface 할일 {\n  id: string;\n  제목: string;\n  완료: boolean;\n  마감?: string;\n}\n\nexport const 빈할일 = (id: string): 할일 => ({ id, 제목: '', 완료: false });\n`;
const API_1 = "export async function 목록가져오기() {\n  return fetch('/api/todos').then((r) => r.json());\n}\n";
const API_2 = `${API_1}\nexport async function 추가하기(제목: string) {\n  return fetch('/api/todos', { method: 'POST', body: JSON.stringify({ 제목 }) });\n}\n`;
const DESIGN_1 = '# 설계 메모\n\n- 로컬 스토리지에 저장한다\n';
const DESIGN_2 = '# 설계 메모\n\n- 로컬 스토리지에 저장한다\n- 서버 동기화는 나중에\n- 마감일은 ISO 문자열로 둔다\n';
const DESIGN_HUMAN = '# 설계 메모\n\n(처음부터 다시 쓰는 중)\n';
const ENV = 'OPENAI_API_KEY=sk-demo000111222333444555666777\nPORT=3000\n';

const rec = [];

function user(sid, uuid, at, text) {
  rec.push({
    type: 'user', uuid, timestamp: at, cwd: REPO, sessionId: sid, version: '2.0.0',
    gitBranch: 'main', message: { role: 'user', content: text },
  });
}

function asst(sid, uuid, at, tool, rel, text) {
  rec.push({
    type: 'assistant', uuid, timestamp: at, cwd: REPO, sessionId: sid, version: '2.0.0',
    gitBranch: 'main',
    message: {
      role: 'assistant', model: 'claude-opus-5',
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: `t-${uuid}`, name: tool, input: { file_path: path.join(REPO, rel) } },
      ],
      usage: {
        input_tokens: 1200, output_tokens: 340,
        cache_read_input_tokens: 8000, cache_creation_input_tokens: 900,
      },
    },
  });
}

function ver(msgUuid, rel, version, file, at) {
  rec.push({
    type: 'file-history-delta', messageId: msgUuid, snapshotMessageId: `s-${msgUuid}`,
    trackingPath: path.join(REPO, rel),
    backup: { backupFileName: file, version, backupTime: at }, timestamp: at,
  });
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(path.join(HOME, 'projects', PROJECT_DIR), { recursive: true });
mkdirSync(REPO, { recursive: true });

// ── 저장소 초기 상태 ──────────────────────────────────────────────────
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'demo@example.com');
git('config', 'user.name', 'ccaudit demo');
w('README.md', README_0);
w('.gitignore', '.env\nnode_modules/\n');
git('add', '-A');
git('commit', '-qm', 'chore: 초기 커밋');

// ── 세션 1 (2026-08-18) — 뼈대 만들기 ────────────────────────────────
user(S1, 'u1', '2026-08-18T00:10:00.000Z', '할 일 앱 뼈대를 만들어줘. 타입부터.');
asst(S1, 'a1', '2026-08-18T00:10:30.000Z', 'Write', 'src/할일.ts', '할 일 타입부터 만들겠습니다.');
ver('a1', 'src/할일.ts', 1, null, '2026-08-18T00:10:31.000Z');
asst(S1, 'a2', '2026-08-18T00:12:00.000Z', 'Edit', 'src/할일.ts', '완료 여부와 마감일을 더합니다.');
ver('a2', 'src/할일.ts', 2, 'todo@v2', '2026-08-18T00:12:01.000Z');
backup(S1, 'todo@v2', TODO_1);
ver('a2', 'src/할일.ts', 3, 'todo@v3', '2026-08-18T00:12:40.000Z');
backup(S1, 'todo@v3', TODO_2);
user(S1, 'u2', '2026-08-18T00:20:00.000Z', '설계 메모도 남겨줘.');
asst(S1, 'a3', '2026-08-18T00:20:20.000Z', 'Write', 'notes/설계.md', '메모를 남깁니다.');
ver('a3', 'notes/설계.md', 1, null, '2026-08-18T00:20:21.000Z');
ver('a3', 'notes/설계.md', 2, 'design@v2', '2026-08-18T00:20:22.000Z');
backup(S1, 'design@v2', DESIGN_1);

w('src/할일.ts', TODO_2);
w('notes/설계.md', DESIGN_1);
git('add', 'src/할일.ts');
git('commit', '-qm', 'feat: 할 일 모델');                    // → 커밋됨

// ── 세션 2 (2026-08-19) — API 와 문서 ────────────────────────────────
user(S2, 'u3', '2026-08-19T01:00:00.000Z',
  'API 붙여줘. 키는 sk-demo000111222333444555666777 쓰면 돼.');
asst(S2, 'a4', '2026-08-19T01:00:40.000Z', 'Write', 'src/api.ts', 'API 호출부를 만들겠습니다.');
ver('a4', 'src/api.ts', 1, null, '2026-08-19T01:00:41.000Z');
ver('a4', 'src/api.ts', 2, 'api@v2', '2026-08-19T01:00:42.000Z');
backup(S2, 'api@v2', API_1);
asst(S2, 'a5', '2026-08-19T01:02:00.000Z', 'Edit', 'src/api.ts', '추가 API 도 붙입니다.');
ver('a5', 'src/api.ts', 3, 'api@v3', '2026-08-19T01:02:01.000Z');
backup(S2, 'api@v3', API_2);
asst(S2, 'a6', '2026-08-19T01:05:00.000Z', 'Write', '.env', '키는 .env 로 뺍니다.');
ver('a6', '.env', 1, null, '2026-08-19T01:05:01.000Z');
ver('a6', '.env', 2, 'env@v2', '2026-08-19T01:05:02.000Z');
backup(S2, 'env@v2', ENV);
asst(S2, 'a7', '2026-08-19T01:10:00.000Z', 'Edit', 'README.md', '설치 방법을 README 에 적습니다.');
ver('a7', 'README.md', 1, 'readme@v1', '2026-08-19T01:10:01.000Z');
backup(S2, 'readme@v1', README_0);
ver('a7', 'README.md', 2, 'readme@v2', '2026-08-19T01:10:02.000Z');
backup(S2, 'readme@v2', README_CLAUDE);
asst(S2, 'a8', '2026-08-19T01:15:00.000Z', 'Edit', 'notes/설계.md', '설계 메모를 보강합니다.');
ver('a8', 'notes/설계.md', 1, 'design2@v1', '2026-08-19T01:15:01.000Z');
backup(S2, 'design2@v1', DESIGN_1);
ver('a8', 'notes/설계.md', 2, 'design2@v2', '2026-08-19T01:15:02.000Z');
backup(S2, 'design2@v2', DESIGN_2);

w('src/api.ts', API_2);            // 커밋하지 않는다        → 미커밋
w('.env', ENV);                    // .gitignore 대상        → 판정 불가
w('README.md', README_CLAUDE);
w('notes/설계.md', DESIGN_2);
git('add', 'README.md');
git('commit', '-qm', 'docs: 설치 방법 추가');

// ── 세션이 끝난 뒤 사람이 한 일 ───────────────────────────────────────
w('README.md', README_HUMAN);      // 커밋된 뒤 또 고쳤다     → 이후 변경됨
w('notes/설계.md', DESIGN_HUMAN);   // 커밋 없이 덮어썼다      → 유실

// ── 세션 파일 쓰기 ────────────────────────────────────────────────────
for (const [sid, title] of [[S1, '할 일 앱 뼈대'], [S2, 'API 연결과 문서']]) {
  const own = rec.filter((r) => (
    r.type === 'file-history-delta' ? OWNER[r.messageId] === sid : r.sessionId === sid
  ));
  const lines = [
    JSON.stringify({ type: 'ai-title', aiTitle: title, sessionId: sid }),
    ...own.map((r) => JSON.stringify(r)),
  ];
  writeFileSync(path.join(HOME, 'projects', PROJECT_DIR, `${sid}.jsonl`), `${lines.join('\n')}\n`);
}

console.log(`데모 생성: ${ROOT}`);
console.log(`  저장소: ${REPO}`);
console.log(`  실행:   node dist/cli.js --home "${HOME}" --out demo.html`);
console.log('  기대:   커밋됨·미커밋·이후 변경됨·유실·판정 불가 각 1건 + 시크릿 마스킹');
