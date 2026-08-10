# 픽스처 목록

| 픽스처 | 담당 함정 | 검증하는 태스크 |
|---|---|---|
| `cjk-collision` | 한글 경로 2개 프로젝트가 한 폴더에 혼재 | Task 3.3 |
| `cwd-moved` | 세션 도중 cwd 변경 → 소속은 첫 cwd | Task 3.3 |
| `null-backup` | backupFileName null 혼재 → partial | Task 4.1, 4.2 |
| `broken-lines` | 깨진 JSONL 줄 → skip + parseErrors | Task 2.1 |
| `in-progress` | 잘린 마지막 줄 → inProgress 배지 | Task 2.1, 4.5 |
| `no-git` | git 저장소 아님 → unknown | Task 4.4 |

모든 픽스처는 가짜 `~/.claude` 홈이다. 테스트에서
`process.env.CCAUDIT_CLAUDE_HOME = 'tests/fixtures/<name>'` 로 지정해 사용한다.
