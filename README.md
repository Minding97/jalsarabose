# 잘살아보세

함께 사는 사람들이 지출, 집안일, 냉장고 재고, 날짜 기반 생활 이벤트를 한 곳에서 관리하는 공동생활 관리 앱입니다.

## 기술 스택

- Expo + React Native: iOS, Android, Web 프리뷰를 같은 코드베이스로 개발
- TypeScript: 도메인 모델과 화면 상태를 명확하게 관리
- Expo Router: 파일 기반 라우팅과 하단 탭 구조
- Zustand: MVP 단계의 가벼운 클라이언트 상태 관리
- date-fns: 캘린더, 납부일, 유통기한 계산
- lucide-react-native: 공통 아이콘 시스템

## MVP 범위

- 홈: 오늘의 집안일, 다가오는 지출, 유통기한 임박 항목, 월간 요약
- 캘린더: 지출, 집안일, 냉장고 유통기한 이벤트 통합 표시
- 지출: 공과금/생활비 등록 모델, 납부 상태, 월간/유형별 요약
- 집안일: 담당자, 반복 주기, 점수, 완료 상태, 수행 비율
- 냉장고: 재고, 보관 위치, 유통기한, 소진/폐기 상태
- 가구: 가구/가구원/초대 코드 데이터 모델
- 알림 준비: 항목별 `notificationEnabled`와 홈 알림 대상 요약

Firebase Auth와 Firestore 기반 실시간 공유는 MVP 뼈대에 포함되어 있습니다. Expo Notifications 기반 로컬 알림 예약도 홈에서 실행할 수 있으며, 웹 미리보기에서는 지원 제한 안내를 표시합니다.

## 실행

```bash
npm install
npm run start
```

웹 프리뷰:

```bash
npm run web
```

내부망 QA 환경:

```bash
npm run qa:setup
npm run qa:lan
```

QA 모드는 앱 로그인과 독립된 제보 버튼, 화면 Recording, Jira 티켓 생성을 제공합니다. Jira와 야간 자동수정 설정은 [docs/qa-automation.md](docs/qa-automation.md)를 따릅니다.

Firebase 키 없이 샘플 데이터로 확인:

```bash
npm run web:mock
```

정적 웹 빌드:

```bash
npm run export:web
```

개발 중 전체 검증:

```bash
npm run verify
```

`SMOKE_TEST_EMAIL`과 `SMOKE_TEST_PASSWORD`가 있으면 `npm run verify`가 Firebase smoke test까지 이어서 실행합니다.

Firebase 데모 데이터 만들기:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> npm run demo:seed
```

데모 데이터만 정리:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> npm run demo:reset
```

## Firebase 설정

실제 로그인/가구 공유를 사용하려면 `.env.local`에 Firebase Web App 설정을 넣습니다.

```bash
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_BACKEND_PROVIDER=firebase
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

Firebase 설정 전에도 화면을 확인하려면:

```bash
EXPO_PUBLIC_USE_MOCKS=true
```

Firestore 컬렉션 구조:

- `users/{uid}`
- `households/{householdId}`
- `households/{householdId}/members/{uid}`
- `households/{householdId}/expenses/{expenseId}`
- `households/{householdId}/chores/{choreId}`
- `households/{householdId}/fridgeItems/{itemId}`
- `inviteCodes/{code}`

Firebase 설정 절차는 [docs/firebase-setup.md](docs/firebase-setup.md)를 기준으로 진행합니다. 알림 구현 기준은 [docs/notifications.md](docs/notifications.md)에 정리합니다. 디자인 전 준비 범위는 [docs/pre-design-readiness.md](docs/pre-design-readiness.md), 실제 기기 확인은 [docs/device-testing.md](docs/device-testing.md)를 따릅니다.

환경변수와 Firebase 프로젝트 연결 확인:

```bash
npm run verify:env
```

실제 Firebase rules와 CRUD smoke test:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> npm run smoke:firebase
```

## 프로젝트 구조

```text
src/app/                 Expo Router 화면
src/components/app/      앱 공통 UI 컴포넌트
src/data/                MVP 샘플 데이터
src/domain/              PRD 기반 타입과 라벨
src/services/            Firebase SDK 접근과 Firestore 변환 계층
src/store/               클라이언트 상태 저장소
src/utils/               날짜/대시보드 계산 유틸
scripts/                 검증/운영 보조 스크립트
docs/                    제품/아키텍처 문서
```

## 다음 개발 순서

1. 실제 기기에서 Expo Notifications 로컬 알림 수신 확인
2. 디자인 확정 후 `src/components/app`의 토큰과 컴포넌트 스타일 반영
3. 배포 환경 구성과 공개 URL 검증
4. 앱 아이콘, splash, 스토어 메타데이터 준비
