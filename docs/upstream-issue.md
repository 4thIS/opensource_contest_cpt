# 업스트림 이슈 초안 (Claude Code)

> 제출 전 확인: 아래 경로·`ls` 출력은 **실제 머신의 사용자 이름을 지운 뒤** 올린다.
> 제출 후 URL 을 `docs/결과보고서.md` 7절에 기입한다.
> 대상 저장소: https://github.com/anthropics/claude-code/issues

---

**Title:** Session project directories collide for non-ASCII paths (each CJK char → single `-`)

**Body:**

## What happens

`~/.claude/projects/<encoded-cwd>/` encodes the launch directory into a folder name, but every
non-ASCII character is replaced by a single `-`. Two different projects whose paths differ only
in CJK segments therefore encode to the **same** folder, and their sessions end up mixed together.

```
C:\Users\<me>\work\공모전\임베디드   →  C--Users-<me>-work---------
C:\Users\<me>\work\공모전\오픈소스   →  C--Users-<me>-work---------   ← identical
```

## Reproduction

```bash
mkdir -p ~/work/공모전/임베디드 ~/work/공모전/오픈소스
cd ~/work/공모전/임베디드 && claude   # start a session, exit
cd ~/work/공모전/오픈소스 && claude   # start a session, exit
ls ~/.claude/projects/                # one folder holds both projects' sessions
```

Real output from my machine (3 sessions from 2 unrelated projects in one folder):

```
~/.claude/projects/C--Users-<me>-work---------/
  08253b7f-....jsonl   "RC카 남은 작업 확인"        cwd = ...\공모전\임베디드
  6a181cf2-....jsonl   "설계명세서 검토"            cwd = ...\공모전\임베디드
  b4d33f3c-....jsonl   "Claude Code 세션 관리 검토"  cwd = ...\공모전\오픈소스
```

## Why it matters

- `--resume` / session pickers that group by folder show sessions from an unrelated project.
- Any tool built on `~/.claude/projects/` (there are many session viewers) mis-attributes
  history for Korean, Japanese and Chinese paths — the folder name is simply not unique.
- The information needed to disambiguate *is* in the data (each record carries `cwd`), so the
  loss happens only in the folder naming.

Note that even the per-session assumption is not safe: in one of the sessions above the `cwd`
changed mid-session (`...\임베디드` → `...\임베디드\rc_car`), so "one session = one project"
does not hold either.

## Suggested fixes (any one would do)

1. Append a short hash of the original absolute path to the folder name
   (`C--Users-me-work---------a1b2c3d4`) — keeps the readable prefix, removes collisions.
2. Percent-encode non-ASCII characters instead of collapsing them to `-`.
3. Write a small metadata file inside each project folder containing the original absolute path,
   so consumers can disambiguate without changing the folder naming.

## Environment

- Claude Code 2.x, Windows 11 (also reproduces on macOS/Linux with any non-ASCII path segment)
