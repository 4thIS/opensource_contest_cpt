# ccaudit — Claude Code 파일 변경 감사 리포트 생성기 · 설계 명세

> 작성일: 2026-08-05 · 대상: 제20회 오픈소스 개발자대회 (학생부문) · 출품 마감 2026-08-27
> 팀: 2~3인 · 스택: Node + TypeScript · 라이선스: MIT

---

## 1. 한 줄 정의

`npx ccaudit` 한 줄로, Claude Code가 내 저장소에 실제로 무슨 파일을 만들고 고쳤는지를
세션 이력과 함께 **공유 가능한 단일 HTML 리포트**로 뽑아내는 CLI.

> **이름 `ccaudit`은 작업명(working name)이다.** M0 단계에서 npm 이름 충돌을 확인하고
> 확정한다. 이름 변경은 설계 어디에도 영향을 주지 않는다.

---

## 2. 문제 정의

### 2-1. 사용자가 답을 못 얻는 질문

Claude Code를 며칠 쓰고 나면 다음 질문에 답할 방법이 없다.

- 지난 3주간 Claude Code가 **이 저장소에** 정확히 무슨 짓을 했나?
- 어떤 세션이 이 파일을 건드렸나? 그 코드는 어떤 대화에서 나왔나?
- 커밋하지 않고 날아간 변경은 없나?

Claude Code 자체 기능인 `/rewind`는 **현재 세션 안에서만** 동작하고, 세션이 끝나면
그 정보에 접근할 수단이 사라진다. (근거: https://code.claude.com/docs/en/checkpointing)

### 2-2. 경쟁 현황 — "세션 뷰어"는 포화, "파일 감사"는 비어 있음

조사 결과 Claude Code 세션 뷰어는 최소 15개가 존재한다. 아래는 대표 사례다.

| 프로젝트 | 성격 |
|---|---|
| [claude-code-trace](https://github.com/delexw/claude-code-trace) | 대화·툴콜·토큰 뷰어 (desktop/web/TUI) |
| [claude-board](https://github.com/felix5127/claude-board) | 대화·토큰 분석 대시보드 |
| [claude-code-chat-explorer](https://github.com/drewburchfield/claude-code-chat-explorer) | SQLite FTS5 전문검색 |
| [claude-code-sessions](https://github.com/kmizzi/claude-code-sessions) | 세션 브라우징·분석 |
| [claude-run](https://github.com/nilbuild/claude-run) | 웹 UI 뷰어 |
| [claude-history](https://github.com/raine/claude-history) | 퍼지 검색 CLI |

**이들은 전부 "대화"가 1급 객체다. "파일"이 1급 객체인 도구는 없다.**
ccaudit은 파일을 중심에 놓아 정면 경쟁을 피한다.

---

## 3. 데이터 기반 (실측 검증 완료)

설계에 앞서 `~/.claude/` 실제 데이터를 검증했다. 아래는 전부 실측 확인된 사실이다.

### 3-1. 사용 가능한 데이터

| 필요한 것 | 출처 |
|---|---|
| 세션 목록 | `~/.claude/projects/<인코딩경로>/<uuid>.jsonl` |
| 세션 제목 | JSONL 내 `ai-title` 레코드 — **Claude Code가 이미 자동 생성** |
| 세션 메타 | `cwd`, `gitBranch`, `version`, `timestamp`, `model`, `effort` |
| 토큰/비용 | assistant 메시지의 `usage` (cache read/creation 분리) |
| 파일 변경 | `file-history-delta`, `file-history-snapshot` 레코드 |
| **파일 내용 원본** | `~/.claude/file-history/<sessionId>/<hash>@v<N>` — 버전별 전문 저장 |
| 프롬프트 이력 | `~/.claude/history.jsonl` |

### 3-2. 변경 재구성 규칙

- `file-history-delta` = 파일이 추적에 **처음 진입**한 시점 (경로 + 최초 버전)
- `file-history-snapshot.trackedFileBackups` = 그 시점의 **전체 추적 상태** 스냅샷
- 실측: 편집 툴콜 13회에 델타는 6개.
  **델타만으로는 불완전하며, 스냅샷 시계열을 병합해야 전체 그림이 나온다.**
  이것이 본 프로젝트의 핵심 알고리즘이다.

생성/수정 판별 규칙:

| 신호 | 의미 |
|---|---|
| `version: 1` 이고 `backupFileName: null` | Claude가 **새로 생성**한 파일 (백업할 이전 내용 없음) |
| `version: 1` 이고 `backupFileName: "<hash>@v1"` | 기존 파일. `@v1`이 **Claude 손타기 전 원본** |

**제약:** 후속 버전(v4, v5 등)에도 `backupFileName: null`이 섞여 있다.
**모든 버전에 백업 파일이 있지는 않다.** diff 복원은 best-effort이며,
구멍은 UI에 정직하게 표시한다 (`diffAvailability` 필드).

### 3-3. 발견한 결함 — 비ASCII 경로 디렉터리 충돌

세션 저장 폴더명은 경로 인코딩인데, **비ASCII 문자를 `-` 하나로 치환**한다.

```
C:\Users\ddj25\work\공모전\임베디드  →  C--Users-ddj25-work---------
C:\Users\ddj25\work\공모전\오픈소스  →  C--Users-ddj25-work---------   ← 동일
```

실측 결과 한 폴더 안에 서로 다른 두 프로젝트의 세션이 섞여 있었다.

| 세션 | 제목 | 실제 `cwd` |
|---|---|---|
| `08253b7f` | RC카 남은 작업 확인 | `…\공모전\임베디드` |
| `6a181cf2` | 설계명세서 검토 | `…\공모전\임베디드` |
| `b4d33f3c` | Claude Code 세션 관리 기능 구현 검토 | `…\공모전\오픈소스` |

또한 `08253b7f`는 세션 도중 `cwd`가 `…\임베디드` → `…\임베디드\rc_car`로 바뀌었다.
**"세션 하나 = 프로젝트 하나"라는 가정 자체가 성립하지 않는다.**

**결론: 폴더명을 신뢰하면 안 되며, JSONL 내부의 `cwd`로 프로젝트를 재구성해야 한다.**
폴더명 기반으로 그룹핑하는 기존 도구는 한국어·중국어·일본어 경로에서 오작동한다.

> **부수 활동:** 이 동작은 Claude Code 쪽 문제이므로 재현 케이스와 함께 업스트림에
> 이슈를 제출한다. 결과보고서의 "오픈소스 생태계 기여" 항목에 실제 근거가 된다.

---

## 4. 범위

### 4-1. 포함

1. **`cwd` 기반 프로젝트 재구성** — 폴더명 충돌·CJK 경로 정확 처리
2. **파일 감사 뷰** — 파일별 생성/수정 이력, 관여 세션, 원본→최종 diff
3. **git 대조 4분류** — committed / uncommitted / superseded / lost
4. **세션 뷰** — `ai-title` 목록, 대화·툴콜 드릴다운, 토큰 요약
5. **검색** — 파일명·프롬프트·세션 제목 (인라인 JS, 서버 불필요)
6. **단일 HTML 출력** — 의존성·서버 없이 파일 하나로 공유
7. **시크릿 마스킹** — 기본 활성화

### 4-2. 제외 (YAGNI)

- **파일 복원/rewind 실행 기능** — 리포트는 읽기 전용. 위험하고 본체 기능이 아님
- 실시간 감시(watch), 클라우드 업로드, 팀 계정
- 라인 단위 blame — 파일·변경 블록 단위까지만
- Claude Code 외 다른 에이전트 지원

---

## 5. 형태 결정 — CLI + 정적 HTML

### 5-1. 선택 근거

| 형태 | Windows `cmd` 환경 |
|---|---|
| **CLI + 정적 HTML (채택)** | 터미널 출력은 2줄, 본체는 브라우저 렌더링. 인코딩 문제를 구조적으로 회피 |
| TUI | CP949에서 박스문자 깨짐 + 한글 폭 2칸 계산 어긋나 레이아웃 붕괴 |
| 로컬 웹서버 | 포트 리스닝 시 **Windows Defender 방화벽 팝업** — 시연 사고 위험 |
| 데스크톱 앱 | 코드서명 없으면 SmartScreen 경고. 22일에 빌드·배포 부담 과다 |

**서버를 띄우지 않는 것이 Windows에서 명확한 이점이다.**
추가로, 정적 파일 출력은 기존 15개 경쟁자(전부 로컬 서버)가 못 하는
**결과 보존·공유·CI 아티팩트 첨부**를 가능하게 한다.

> 실측 참고: 개발 PC의 코드페이지는 65001(UTF-8)이라 한글 출력이 정상이었으나,
> 한국어 Windows의 레거시 `cmd.exe`는 CP949로 뜨는 경우가 많아 위 판단은 유지된다.

### 5-2. CLI 요구사항

- Node 18+ / `npx ccaudit` 무설치 실행
- 터미널 출력 최소화, `--no-color`, 인코딩 미지원 감지 시 ASCII 폴백
- `--open` — Windows `start`, macOS `open`, Linux `xdg-open` 분기
- 경로 정규화 계층 필수: `\` ↔ `/`, 드라이브 문자 대소문자, Windows 260자 제한,
  `trackedFileBackups` 키의 OS별 구분자 차이
- 출력 기본 경로 `./ccaudit-report.html`, 생성 후 `.gitignore` 추가 안내 1줄

### 5-3. 플래그

| 플래그 | 기본값 | 설명 |
|---|---|---|
| `--out <path>` | `./ccaudit-report.html` | 출력 경로 |
| `--open` | off | 생성 후 브라우저 열기 |
| `--redact` / `--no-redact` | **on** | 시크릿 마스킹 |
| `--no-transcript` | off | 대화 본문 제외, 파일 감사만 |
| `--since <date>` | 전체 | 기간 필터 |
| `--no-color` | 자동 감지 | 터미널 색상 비활성 |

---

## 6. 아키텍처

```
~/.claude/  ──▶ ① reader ──▶ ② resolver ──▶ ③ auditor ──▶ ④ renderer ──▶ report.html
             (원시 읽기)    (프로젝트 판정)   (변경 재구성)   (단일 HTML)
```

| 모듈 | 책임 | 입력 → 출력 | 의존 |
|---|---|---|---|
| **① reader** | JSONL 스트리밍 파싱, 깨진 줄 skip, 타입별 레코드 분류 | 경로 → `RawRecord[]` | fs |
| **② resolver** | `cwd`로 프로젝트 판정, git 루트 탐색, 경로 정규화, 세션↔프로젝트 매핑 | `RawRecord[]` → `Project[]`, `Session[]` | git |
| **③ auditor** | 스냅샷 시계열 병합 → 파일별 버전 체인 복원, `file-history/`에서 내용 로드, diff 생성, git 대조 4분류 | `Session[]` → `FileAudit[]` | diff 라이브러리 |
| **④ renderer** | 데이터 JSON 인라인 + JS/CSS 번들 인라인 → 자립 HTML 1개 | `AuditReport` → HTML 문자열 | esbuild |

### 6-1. 경계 규칙

- **①~③은 파일시스템 읽기 외 부작용이 없다.** 순수 데이터 변환이므로
  픽스처 JSONL만으로 유닛테스트가 성립한다.
- **`AuditReport` 타입이 ③과 ④ 사이의 유일한 계약이다.**
  M0에서 이 타입을 고정하고 목 데이터를 만들면 백엔드/프론트가 서로를 기다리지 않는다.
- ④는 데이터 출처를 모른다. `AuditReport` JSON을 받아 HTML을 반환하는 순수 뷰.
- CLI 엔트리는 얇게 유지: 인자 파싱 → 파이프라인 호출 → 파일 쓰기 → `--open`.

### 6-2. 프로젝트 판정 규칙

**프로젝트 키 = 실행 `cwd`의 git 저장소 루트, 없으면 실행 `cwd` 그 자체.
폴더 이름은 완전히 무시한다.**

- "실행 cwd" = 세션 **첫 메시지**의 `cwd`.
  도중에 하위 폴더로 이동한 이력은 `cwds[]`에 기록만 하고 소속은 실행 cwd로 확정한다.
- **상위 폴더로의 병합은 하지 않는다.** 과거에 `work` 같은 상위 폴더에서 한 번이라도
  실행한 이력이 있으면 모든 프로젝트가 한 덩어리로 뭉치기 때문이다.
  `공모전`은 실행된 적이 없으므로 `임베디드`와 `오픈소스`는 자연히 분리된다.
- 프로젝트 루트 밖 경로를 건드린 변경은 **"외부 파일" 섹션**으로 분리한다
  (`FileAudit.relPath === null`). 감사 도구에서 가장 중요한 항목이다.

### 6-3. 분업 (2~3인)

| 담당 | 모듈 |
|---|---|
| A | ① reader + ② resolver — 경로·인코딩·git |
| B | ③ auditor — 스냅샷 병합·diff 복원 (최난도) |
| C (3인일 때) | ④ renderer + CLI. 2인이면 A가 겸함 |

---

## 7. 리포트 설계

### 7-1. 화면 구조 (배치 설명용 와이어프레임 — 확정 디자인 아님)

```
┌──────────────────────────────────────────────────────────────┐
│ ccaudit  ·  공모전\임베디드          2026-07-05 ~ 08-05      │
│ 세션 7  파일 12  +842 -113   ⚠ 미커밋 3  ⛔ 유실 1           │
├──────────────────────────────────────────────────────────────┤
│ [ 파일 감사 ]  [ 세션 ]  [ 경고 3 ]        🔍 검색_________   │
├──────────────────────────────────────────────────────────────┤
│ ▾ rc_car/                                                    │
│    진행상황.md      생성  3세션  +210     ⚠ 미커밋   [diff ▾]│
│    README.md        수정  2세션  +18 -4   ✓ 커밋됨   [diff ▸]│
│ ▾ (프로젝트 외부)                                            │
│    ..\..\.claude\settings.json  수정  1세션  ⛔ 유실  [diff ▸]│
│                                                              │
│   └ 펼치면: 버전 체인 v1→v2→v3, 각 단계 diff,               │
│             "이 변경을 만든 대화" 링크 → 세션 탭으로 점프    │
└──────────────────────────────────────────────────────────────┘
```

- **파일 감사** 탭이 첫 화면 (기본 진입점)
- **세션** 탭 — `ai-title` 목록, 타임라인, 대화 드릴다운, 토큰
- **경고** 탭 — 4-분류 중 문제 항목(`lost`, `missing-backup`, `external-write` 등)만 집계
- 검색은 인라인 JS로 파일명·세션 제목·프롬프트를 동시 탐색

### 7-2. git 대조 4분류 (+ 판정 불가 1)

판정 기준선은 **그 파일을 건드린 가장 최근 세션이 마지막으로 남긴 내용**이다.
`gitState`는 파일 단위 필드이며, 한 파일을 여러 세션이 건드린 경우
**가장 나중 세션의 최종본 하나만** 기준으로 삼는다.
중간 버전과 이전 세션의 결과물은 덮어써지는 것이 정상이므로 판정에서 제외한다.

| 상태 | 정의 | 의미 |
|---|---|---|
| `committed` | 세션 최종본 = 현재 디스크, git에 커밋됨 | 정상 |
| `uncommitted` | 세션 최종본 = 현재 디스크, 커밋 안 됨 | 커밋 필요 |
| `superseded` | 이후 다른 세션·사람이 변경했고, 세션 최종본이 git 히스토리에 존재 | 정상 (오탐 방지) |
| `lost` | 세션 최종본이 **디스크에도 git 히스토리에도 없음** | ⛔ 사라진 작업 |
| `unknown` | git 저장소가 아니거나 git 조회 실패 | 판정 불가 |

**구현:** 백업본 내용을 해싱하여 (a) 현재 파일, (b) 해당 경로의 git blob 목록
(`git rev-list` → `git cat-file --batch-check`)과 대조한다.
git이 없는 프로젝트는 디스크 대조만 수행하고 `unknown`을 표시한다.

### 7-3. 데이터 계약 (`AuditReport`)

**M0에서 최우선으로 고정한다.** ③↔④의 유일한 인터페이스다.

```ts
interface AuditReport {
  meta:    { generatedAt: string; toolVersion: string; ccVersions: string[] };
  project: { root: string; displayName: string; isGitRepo: boolean };
  range:   { from: string; to: string };
  stats:   { sessions: number; created: number; modified: number; external: number;
             linesAdded: number; linesRemoved: number; uncommitted: number; lost: number;
             tokens: TokenSum };
  files:    FileAudit[];
  sessions: SessionSummary[];
  warnings: Warning[];
}

interface FileAudit {
  id: string;                             // 정규화된 absPath의 해시 (리포트 내 앵커로도 사용)
  absPath: string;
  relPath: string | null;                 // null = 프로젝트 외부
  status: 'created' | 'modified' | 'deleted';   // 판정 기준은 7-5 참조
  gitState: 'committed' | 'uncommitted' | 'superseded' | 'lost' | 'unknown';
  versions: FileVersion[];                // 버전 체인
  touches: Touch[];                       // 어느 세션이 언제 건드렸나
  diff: DiffHunk[] | null;                // 원본 → 현재
  diffAvailability: 'full' | 'partial' | 'none';
}

interface FileVersion {
  version: number;
  backupFile: string | null;              // null이면 백업 없음
  backupTime: string;
  sessionId: string;
  contentAvailable: boolean;              // backupFile === null이면 false
}

interface Touch {
  sessionId: string;
  messageId: string;
  at: string;
  tool: 'Write' | 'Edit' | 'MultiEdit' | 'NotebookEdit' | 'Bash' | 'unknown';
}

interface SessionSummary {
  id: string;
  title: string | null;                   // ai-title, 없으면 첫 프롬프트 요약
  startedAt: string; endedAt: string;
  launchCwd: string;
  cwds: string[];                         // 도중 이동한 경우 전부
  gitBranches: string[];
  ccVersion: string;
  model: string | null;
  counts: { user: number; assistant: number; tools: Record<string, number> };
  tokens: TokenSum;
  firstPrompt: string;
  fileIds: string[];
  messages?: Message[];                   // --no-transcript 시 생략
  inProgress: boolean;
}

interface Warning {
  kind: 'lost-change' | 'missing-backup' | 'external-write'
      | 'cwd-collision' | 'parse-error';
  severity: 'high' | 'medium' | 'low';
  message: string;
  ref?: string;
}

interface TokenSum {
  input: number; output: number;
  cacheRead: number; cacheCreation: number;
}

interface DiffHunk {
  oldStart: number; oldLines: number;
  newStart: number; newLines: number;
  lines: string[];                        // '+', '-', ' ' 접두
}

interface Message {
  uuid: string;
  role: 'user' | 'assistant';
  at: string;
  text: string;
  toolCalls: { name: string; summary: string }[];
}
```

`diffAvailability`가 신뢰도의 핵심이다. 3-2에서 확인했듯 일부 버전은 백업이 없다.
**없는 것을 있는 것처럼 표시하지 않는다.**

### 7-4. 시크릿 마스킹 (`--redact`, 기본 ON)

"공유 가능한 단일 HTML"이 차별점인 만큼, 같은 이유로 유출 경로가 된다.
리포트에는 대화 전문과 파일 내용이 그대로 들어간다.

- **기본 활성화.** 흔한 시크릿 패턴(`sk-…`, `ghp_…`, AWS 키, `PRIVATE KEY` 블록,
  `.env` 파일 전체)을 `▓▓▓`로 마스킹. 해제는 `--no-redact` 명시 필요
- 리포트 상단에 마스킹된 항목 수를 표시하여 무엇이 가려졌는지 사용자가 인지하게 함
- `--no-transcript`로 대화 본문 없는 경량 리포트 생성 가능

### 7-5. `status` 판정 기준

`gitState`(변경이 살아남았는가)와 별개로, `status`는 **파일에 무슨 일이 있었는가**를 나타낸다.

| `status` | 판정 |
|---|---|
| `created` | 최초 버전이 `version: 1` + `backupFileName: null` (백업할 이전 내용이 없었음) |
| `modified` | 최초 버전에 백업 파일이 존재 (Claude 손타기 전 원본이 있었음) |
| `deleted` | 백업 이력은 있으나 **현재 디스크에 파일이 존재하지 않음** |

`deleted`는 파일 존재 여부로 판정하므로, Claude가 지운 경우와 사용자가 나중에 지운 경우를
구분하지 못한다. 리포트에서는 "현재 없음"으로만 표기하고 원인을 단정하지 않는다.

---

## 8. 에러 처리

**원칙: 부분 실패해도 리포트는 생성된다.** 감사 도구가 중간에 죽으면 무용지물이다.
모든 실패는 예외로 전파하지 않고 `Warning`으로 수집해 리포트에 싣는다.

| 상황 | 처리 |
|---|---|
| JSONL 깨진 줄 / 잘린 마지막 줄 | 해당 줄만 skip, `parse-error` 누적 |
| **진행 중인 세션** | 한 번에 읽고 불완전한 마지막 줄 무시. `inProgress: true` 배지 |
| `file-history` 백업 누락 (`backupFileName: null`) | `diffAvailability: 'partial' \| 'none'` |
| git 없음 / git 명령 실패 | `gitState: 'unknown'`, **git 없이도 정상 동작** |
| Windows 260자 초과 경로 | `\\?\` 프리픽스로 재시도, 실패 시 skip + 경고 |
| 권한 거부 | skip + 경고 |
| 바이너리 파일 | diff 생략, "바이너리" 표시 |
| `~/.claude` 자체가 없음 | **유일한 즉시 종료** — 명확한 안내 메시지 |

---

## 9. 테스트 전략

### 9-1. 픽스처 기반 골든 테스트

실제 세션에서 익명화한 JSONL을 리포지토리에 포함한다. 각 픽스처가 하나의 함정을 담당한다.

| 픽스처 | 담당 함정 | 상태 |
|---|---|---|
| `cjk-collision/` | 한글 경로 2개 프로젝트가 한 폴더에 혼재 | 실물 확보 |
| `cwd-moved/` | 세션 도중 `cwd` 변경 | 실물 확보 |
| `null-backup/` | `backupFileName: null` 혼재 | 실물 확보 |
| `broken-lines/` | 깨진 JSONL 줄 | 합성 |
| `in-progress/` | 기록 중인 세션 | 합성 |
| `no-git/` | git 저장소가 아닌 프로젝트 | 합성 |

### 9-2. 계층별 방식

- ①~③ — vitest 유닛테스트 (순수 함수)
- ③ auditor — **골든 테스트**: 픽스처 → `AuditReport` JSON 스냅샷 비교.
  병합 로직의 회귀를 여기서 잡는다
- ④ renderer — 생성된 HTML을 파싱해 핵심 요소 존재만 확인 (E2E는 과함)
- **GitHub Actions 3-OS 매트릭스** (windows / macos / ubuntu).
  경로 정규화는 CI 없이 반드시 깨진다. 대회 심사에 기능테스트가 포함되므로
  CI 뱃지 자체가 실질 점수이기도 하다

### 9-3. TDD 적용 구간

③의 스냅샷 병합은 테스트를 먼저 작성한다. 머리로 짜면 반드시 틀리며,
테스트 선행이 실제로 더 빠른 구간이다.

---

## 10. 일정 (2026-08-05 → 08-27, 22일)

| 마일스톤 | 기간 | 내용 |
|---|---|---|
| **M0 계약 확정** | 8/5~8/7 (3일) | `AuditReport` 타입 고정, 목 데이터, 픽스처 수집, 리포 초기화, MIT, CI 셋업, npm 이름 확정 → **분업 시작점** |
| **M1 골격** | 8/8~8/13 (6일) | A: ① reader + ② resolver (CJK·cwd 이동) ∥ C: ④ renderer 화면을 목 데이터로 완성 |
| **M2 핵심** | 8/14~8/20 (7일) | B: ③ auditor — 스냅샷 병합, 버전 체인, diff 복원, git 4분류 (최난도, 버퍼 포함) |
| **M3 통합** | 8/21~8/23 (3일) | 통합, `--redact`, 3-OS CI 통과, 자기 프로젝트 도그푸딩 |
| **M4 제출물** | 8/24~8/27 (4일) | README, **3분 시연영상**, 결과보고서, 의존성 라이선스 검증, npm 배포 |

**M4에 4일을 확보한 이유:** 제출물이 1차 서면 30점을 직접 결정한다.
여기서 시간을 못 빼는 것이 가장 흔한 실패 패턴이다.

### 10-1. M2 지연 시 컷라인 (미리 확정)

1. `superseded` 판정 → 전부 `unknown`으로 격하
2. 세션 대화 드릴다운 → 첫 프롬프트만 표시
3. 검색 → 파일명 검색만

### 10-2. 절대 컷하지 않는 것

**CJK 경로 정확성 · 파일 감사 메인 뷰 · diff · `--redact`**

이 4개가 차별점 자체다. 하나라도 빠지면 "또 하나의 세션 뷰어"로 전락한다.

---

## 11. 라이선스 및 의존성

- 라이선스: **MIT** (첫 커밋부터 적용)
- 런타임 의존성은 diff 라이브러리 수준으로 최소화, esbuild는 빌드 전용
- 대회가 라이선스 충돌을 실제로 검증하므로 의존성이 적을수록 유리하다
- M4에서 전체 의존성 라이선스 스캔을 수행하고 결과를 결과보고서에 첨부한다

---

## 12. 심사 대응 요약

| 심사 관점 | 대응 |
|---|---|
| 재사용성 | `npx ccaudit` 무설치 실행, npm 배포 |
| 차별성 | 기존 15개는 "대화" 뷰어. 본 도구는 "파일"이 1급 객체 |
| 기술적 깊이 | 스냅샷 시계열 병합, git 히스토리 대조 4분류 |
| 실증 | 실제 데이터로 CJK 경로 충돌 결함 발견 → 업스트림 이슈 제출 |
| 완성도 | 3-OS CI, 골든 테스트, 부분 실패 내성 |
| 보안 의식 | 공유 가능한 산출물에 대한 시크릿 마스킹 기본 활성화 |
| 시연 (3분) | ① 한글 경로 프로젝트 분리 → ② 파일 감사 리포트 → ③ 유실 변경 발견 |
