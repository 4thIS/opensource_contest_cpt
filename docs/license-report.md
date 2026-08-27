# 라이선스 검증 리포트

- 대상: `openccaudit@0.1.0`
- 배포 라이선스: **MIT** (`LICENSE`)
- 검사일: 2026-08-21 · 재검증 2026-08-26 (패키지명 변경 후)
- 도구: `npx license-checker-rseidelsohn`

## 런타임 의존성 (배포되는 코드가 실제로 쓰는 것)

```
$ npx license-checker-rseidelsohn --production
├─ diff@5.2.2
│  ├─ licenses: BSD-3-Clause
│  ├─ repository: https://github.com/kpdecker/jsdiff
│  └─ licenseFile: node_modules/diff/LICENSE
└─ openccaudit@0.1.0
   ├─ licenses: MIT
   ├─ repository: https://github.com/4thIS/opensource_contest_cpt
   └─ licenseFile: LICENSE
```

```
$ npx license-checker-rseidelsohn --production --summary
├─ BSD-3-Clause: 1
└─ MIT: 1
```

**런타임 의존성은 `diff`(BSD-3-Clause) 하나뿐이다.** BSD-3-Clause 는 MIT 와 마찬가지로
허용형(permissive)이며, 저작권 고지와 면책 조항 유지만 요구한다. copyleft 조항이 없어
MIT 배포와 충돌하지 않는다. 3항(이름 사용 금지)도 ccaudit 이 `jsdiff` 나 그 기여자의
이름을 홍보에 쓰지 않으므로 해당 사항이 없다.

## 개발 의존성 (배포물에 포함되지 않음)

```
$ npx license-checker-rseidelsohn --summary
├─ MIT: 46
├─ BSD-3-Clause: 2
├─ Apache-2.0: 2
└─ ISC: 2
```

전부 허용형이다. copyleft(GPL/AGPL/LGPL)·소스 공개 의무·상용 제한 라이선스는 **0건**.
개발 의존성(`typescript`, `vitest`, `esbuild`, `@types/*`)은 `package.json` 의 `files`
필드가 `dist`·`README.md`·`LICENSE`·`THIRD-PARTY-NOTICES.md` 로 배포 범위를 제한하므로
패키지에 포함되지 않는다.

```
$ npm pack --dry-run
LICENSE · README.md · THIRD-PARTY-NOTICES.md
dist/cli.js · dist/report-app.js · dist/report.css · package.json
총 7개 파일, 22.2 kB
```

## 코드 출처

- 모든 소스는 이 프로젝트에서 새로 작성했다. 외부 코드 복사·이식 없음.
- 번들(`dist/cli.js`)에는 esbuild 가 `diff` 를 함께 묶는다(`npx` 실행 시 설치 부담을
  줄이기 위한 선택). 번들은 BSD-3-Clause 2항이 말하는 "binary form" 배포이므로
  **`THIRD-PARTY-NOTICES.md` 에 jsdiff 저작권 고지 전문을 담아 패키지에 함께 배포**한다
  (`package.json` 의 `files` 에 포함). 빌드도 `legalComments: 'eof'` 로 번들 안의
  라이선스 주석을 지우지 않는다.

## 결론

MIT 배포에 법적 장애가 없다.
