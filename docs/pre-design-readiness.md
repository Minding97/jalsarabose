# 디자인 전 준비 체크리스트

디자인이 확정되기 전에는 기능 뼈대, 데이터 안정성, 검증 루틴을 먼저 고정한다.

## 완료된 준비

- Firebase Auth + Firestore 연결
- 이메일/비밀번호 로그인과 회원가입
- 가구 생성, 초대 코드, 가구원 참여
- 지출과 냉장고 CRUD
- 홈과 캘린더의 실제 Firestore 데이터 연결
- Firestore security rules와 index 설정
- Firebase live smoke test
- 알림 정책 계산과 로컬 알림 예약 진입점
- Mock 모드와 Firebase 모드 분리
- 환경변수 검증 명령
- 통합 검증 명령
- GitHub Actions 기반 mock 검증 워크플로
- Firebase 데모 데이터 생성/정리 스크립트
- 주요 입력, 버튼, 세그먼트 컨트롤의 `testID`와 접근성 라벨

## 디자인 확정 전 계속 진행 가능한 작업

1. 실제 기기에서 로그인, 가구 생성, 초대, CRUD를 확인한다.
2. 실제 기기에서 로컬 알림 권한 요청과 예약 동작을 확인한다.
3. iOS와 Android에서 날짜 입력, 숫자 입력, 키보드 동작을 확인한다.
4. Firebase Console에서 테스트 데이터가 가구별로 분리되는지 확인한다.
5. 테스트 계정 2개로 초대 코드 참여와 권한 분리를 반복 확인한다.
6. 화면별 빈 상태, 로딩 상태, 에러 상태 문구를 제품 톤에 맞게 다듬는다.
7. 디자인 토큰을 받을 준비로 `src/components/app` 공통 컴포넌트만 스타일 변경 지점으로 유지한다.
8. 배포 전 Firebase rules를 다시 배포하고 smoke test를 실행한다.

## 매일 작업 시작 전 검증

```bash
npm run verify:env
npm run typecheck
npm run lint
npm run export:web
```

Firebase 테스트 계정이 준비되어 있으면:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
SMOKE_INVITE_EMAIL=<초대 참여 계정 이메일> \
SMOKE_INVITE_PASSWORD=<초대 참여 계정 비밀번호> \
npm run smoke:firebase
```

디자인 QA용 데모 데이터를 만들려면:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
npm run demo:seed
```

`demo:seed`는 먼저 기존 `[codex-demo-data]` 활성 항목을 정리한 뒤 지출과 냉장고 데모 항목을 다시 만든다. 데모 항목만 정리하려면:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
npm run demo:reset
```

한 번에 실행하려면:

```bash
npm run verify
```

`npm run verify`는 `SMOKE_TEST_EMAIL`과 `SMOKE_TEST_PASSWORD`가 있을 때만 Firebase smoke test를 실행한다.

## 디자인 수령 후 우선 반영 순서

1. 색상, 타이포그래피, 간격 토큰을 `src/constants/theme.ts`에 반영한다.
2. 버튼, 입력, 카드, 빈 상태 컴포넌트를 `src/components/app`에서 먼저 수정한다.
3. 화면별 레이아웃은 데이터 흐름을 바꾸지 않는 범위에서 조정한다.
4. 모바일 작은 화면에서 텍스트 줄바꿈과 버튼 영역을 확인한다.
5. `npm run verify`와 브라우저 클릭 확인을 다시 수행한다.

## 아직 다음 라운드로 남겨둘 작업

- 원격 푸시 발송 서버
- 가구별 세부 권한 관리
- 정산/송금 연동
- 이미지 첨부와 영수증 인식
- 앱스토어/플레이스토어 배포 메타데이터
