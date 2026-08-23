# 의존성 보안 감사

## JAL-44 영향 범위

2026-08-04의 `npm audit` 결과는 moderate 11건과 high 1건이었다. 개별 취약점 12개가 아니라 아래 두 전이 의존성에서 파생된 집계였다.

- moderate 11건: `@expo/config-plugins → xcode@3.0.1 → uuid@7.0.3`의 `GHSA-w5hq-g745-h8pq` 한 건이 Expo 빌드 도구 체인에 전파되었다. 이 권고는 외부 버퍼를 받는 `uuid.v3()`, `v5()`, `v6()`의 범위 검사 누락이다. `xcode`는 iOS 프로젝트 파일 ID 생성에 `uuid.v4()`만 호출하므로 앱 런타임의 원격 공격 경로는 없지만, 감사 결과와 향후 빌드 도구 사용을 안전하게 유지하기 위해 수정한다.
- high 1건: 테스트 실행기 `tsx`가 가져온 `esbuild@0.28.1`의 Deno 모듈 바이너리 무결성 권고였다. 앱과 QA는 Node.js에서 실행되어 해당 Deno 모듈을 불러오지 않았다. 현재 테스트가 Node 내장 실행기로 이전되면서 `tsx`와 `esbuild`도 잠금 파일에서 제거되었다.

## 안전한 업그레이드 경로

`xcode@3.0.1`은 CommonJS의 `require('uuid')`와 `uuid.v4()` API를 사용한다. 따라서 ESM 전용인 최신 uuid 메이저를 전역 강제하지 않고, `xcode`의 자식 의존성만 CommonJS 호환 패치 버전 `uuid@11.1.1`로 고정한다. 이 버전은 기존 호출 형태를 유지하면서 `GHSA-w5hq-g745-h8pq`를 수정한다. 다른 도구가 사용하는 uuid 버전에는 이 예외를 적용하지 않는다.

Expo SDK 메이저 업그레이드는 React Native와 네이티브 모듈을 함께 바꾸므로 이 권고의 패치 경로로 사용하지 않는다. Expo를 다음 SDK로 올릴 때는 `overrides.xcode`가 더 이상 필요한지 다시 확인하고, 상위 패키지가 수정 버전을 직접 요구하면 override를 제거한다.

## 확인 방법

레지스트리에 연결할 수 있는 환경에서 다음을 실행한다.

```bash
npm ci
npm audit --json
npm run qa:test
npm run verify
```

`npm audit --offline`은 로컬 advisory 캐시가 없을 때 0건을 반환할 수 있으므로 보안 판정에 사용하지 않는다. 새 권고가 추가되면 JAL-44 당시의 두 경로와 구분해 직접 취약 패키지, 전이 경로, 운영/개발 의존성 여부를 다시 기록한다.
