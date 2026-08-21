# ccaudit

> Claude Code가 당신의 저장소에 **실제로 무엇을 했는지** 감사합니다.

[![CI](https://github.com/4thIS/opensource_contest_cpt/actions/workflows/ci.yml/badge.svg)](https://github.com/4thIS/opensource_contest_cpt/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 문제

Claude Code를 며칠 쓰고 나면 답할 수 없는 질문이 생깁니다.

- 지난 3주간 Claude Code가 이 저장소에 정확히 무슨 일을 했나?
- 어떤 세션이 이 파일을 건드렸나? 그 코드는 어떤 대화에서 나왔나?
- 커밋하지 않고 날아간 변경은 없나?

`/rewind`는 **현재 세션 안에서만** 동작합니다. 세션이 끝나면 그 이력은 사라집니다.
ccaudit은 `~/.claude`에 남은 세션 기록과 파일 백업을 읽어, 저장소 기준으로 다시 조립합니다.

## 설치 없이 실행

```bash
npx ccaudit --open
```

감사할 저장소 폴더에서 실행하면 `ccaudit-report.html` 한 개가 만들어지고 브라우저로 열립니다.
읽기만 합니다 — 저장소의 파일을 고치거나 지우지 않습니다.

## 무엇이 나오나

![파일 감사 탭 — 한 화면에 git 4분류가 다 보인다](docs/img/report-files.png)


- **파일이 1급 객체입니다.** 어떤 파일이 생성·수정됐고, 어느 세션이 언제 몇 번 건드렸는지.
- **원본 → 현재 diff.** git에 커밋되지 않은 변경까지 그대로 보여줍니다.
- **git 4분류**: `커밋됨` / `미커밋` / `이후 변경됨` / **`유실`**.
  판정 근거가 없으면 `판정 불가`라고 적습니다 — 없는 것을 있는 것처럼 표시하지 않습니다.
- **대화 연결.** 파일에서 그 변경을 만든 세션·메시지로, 세션에서 그 세션이 건드린 파일로.
- **단일 HTML.** 서버도 의존성도 없이 파일 하나. 팀에 공유하거나 CI 아티팩트로 남길 수 있습니다.

파일을 펼치면 **원본 → 현재** diff 가 그대로 나옵니다.

![파일을 펼친 diff 화면](docs/img/report-diff.png)

> 위 화면은 `node tools/demo.mjs` 가 만든 데모 저장소로, 실제 세션 기록이 아닙니다.
> 같은 화면을 직접 만들어 보려면 아래처럼 실행하세요.
>
> ```bash
> node tools/demo.mjs                       # <tmp>/ccaudit-demo 에 데모 저장소·세션 생성
> cd <출력된 저장소 경로>
> node <ccaudit>/dist/cli.js --home <출력된 홈 경로> --open
> ```

## 옵션

| 옵션 | 설명 |
|---|---|
| `--out <path>` | 출력 경로 (기본: `ccaudit-report.html`) |
| `--open` | 생성 후 브라우저로 엽니다 |
| `--no-redact` | 시크릿 마스킹을 끕니다 (기본은 켜짐) |
| `--no-transcript` | 대화 본문을 빼고 가벼운 리포트를 만듭니다 |
| `--since <YYYY-MM-DD>` | 해당 날짜 이후 세션만 포함합니다 |
| `--home <path>` | `~/.claude` 위치를 직접 지정합니다 |
| `--no-color` | 터미널 색상을 끕니다 |
| `--help` | 도움말 |

## 보안

리포트에는 대화와 파일 내용이 들어갑니다. 그래서 **시크릿 마스킹이 기본 활성화**입니다
(`sk-…`, `ghp_…`/`github_pat_…`, AWS 액세스 키, `PRIVATE KEY` 블록, `xox…` 슬랙 토큰,
`.env`·SSH 개인키(`id_rsa`, `id_ed25519`) 파일은 내용 전체). 마스킹 건수는 리포트 상단에 표시되니 **공유 전에 확인하세요.**

생성된 리포트를 저장소에 커밋하지 않도록 `.gitignore`에 `ccaudit-report.html`을 추가하는 것을 권합니다.

## 아키텍처

```
~/.claude/ ──▶ ① reader ──▶ ② resolver ──▶ ③ auditor ──▶ ④ renderer ──▶ report.html
```

| 단계 | 하는 일 |
|---|---|
| ① `reader` | 세션 JSONL 스트리밍 파싱 (깨진 줄은 건너뛰고, 잘린 꼬리는 '기록 중'으로 표시) |
| ② `resolver` | 기록 안의 `cwd`로 프로젝트 재구성, 파일별 git 저장소 탐색, 경로 정규화 |
| ③ `auditor` | 스냅샷 시계열 병합 → 파일별 버전 체인 복원, 백업 내용 로드, diff 생성, git 대조 |
| ④ `renderer` | 데이터·JS·CSS를 전부 인라인해 자립 HTML 한 개로 |

## 한글·CJK 경로

Claude Code는 세션 폴더 이름을 만들 때 비ASCII 문자를 `-` 하나로 치환합니다.
그래서 `공모전\임베디드`와 `공모전\오픈소스`가 **같은 폴더 이름으로 충돌**합니다.
ccaudit은 폴더 이름을 판정에 쓰지 않고, **세션 기록 안의 `cwd`로 프로젝트를 재구성**합니다.
한글 경로가 깨지거나 남의 프로젝트와 섞이지 않는 이유입니다.

## 개발

```bash
npm install
npm test        # vitest
npm run typecheck
npm run build   # dist/cli.js, dist/report-app.js, dist/report.css
```

Windows·macOS·Linux × Node 18·20 매트릭스로 CI를 돌립니다.
테스트 픽스처는 실제 세션을 익명화한 것으로, `tests/fixtures/README.md`에 각 픽스처가
담당하는 함정이 적혀 있습니다.

## 라이선스

MIT. 번들에 포함된 서드파티 코드의 고지는 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
에 있습니다 — 런타임 의존성은 `diff`(BSD-3-Clause) 하나뿐입니다.
검증 내역은 [docs/license-report.md](docs/license-report.md).
