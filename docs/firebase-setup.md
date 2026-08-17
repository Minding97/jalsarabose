# Firebase 설정 체크리스트

## Firebase Console

1. Firebase 프로젝트를 만든다.
2. Web App을 추가한다.
3. Authentication에서 Email/Password provider를 활성화한다.
4. Firestore Database를 만든다.
5. Web App config 값을 `.env.local`에 입력한다.

## `.env.local`

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

## Firestore Rules

`firestore.rules`와 `firestore.indexes.json`을 Firebase 프로젝트에 배포한다.

```bash
firebase deploy --only firestore
```

Firebase CLI 로그인이 안 되어 있으면:

```bash
firebase login
firebase use <project-id>
```

## 환경 검증

`.env.local`과 `.firebaserc`가 같은 Firebase 프로젝트를 가리키는지 확인한다.

```bash
npm run verify:env
```

이 명령은 Firebase 키 값 자체를 출력하지 않고, 필수 항목이 채워졌는지와 프로젝트 ID 일치 여부만 확인한다.

## 확인 시나리오

- 새 계정으로 회원가입한다.
- 가구를 만든다.
- 홈에 초대 코드가 표시되는지 확인한다.
- 다른 계정으로 로그인해서 초대 코드로 참여한다.
- 두 계정에서 같은 가구의 지출과 냉장고 항목이 실시간으로 보이는지 확인한다.
- 한 계정에서 지출을 삭제했을 때 다른 계정에도 반영되는지 확인한다.

## 자동 smoke test

Firebase Auth와 Firestore rules가 실제 프로젝트에서 동작하는지 확인한다.

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
npm run smoke:firebase
```

검증 범위:

- 이메일/비밀번호 로그인
- `users/{uid}` 읽기/쓰기
- 활성 가구 조회 또는 테스트 가구 생성
- `members`, `expenses`, `fridgeItems` 읽기
- 지출/냉장고 항목 create, update, query, delete
- 지출/냉장고 항목의 `householdId` 변조 거부
- MVP 제외 기능의 보존 컬렉션 읽기 거부

초대 코드 참여까지 자동 검증하려면 두 번째 계정을 함께 전달한다.

```bash
SMOKE_TEST_EMAIL=<기존 가구 계정 이메일> \
SMOKE_TEST_PASSWORD=<기존 가구 계정 비밀번호> \
SMOKE_INVITE_EMAIL=<초대 참여 계정 이메일> \
SMOKE_INVITE_PASSWORD=<초대 참여 계정 비밀번호> \
npm run smoke:firebase
```

초대 참여용 테스트 계정이 아직 없으면 자동 생성 옵션을 추가한다.

```bash
SMOKE_TEST_EMAIL=<기존 가구 계정 이메일> \
SMOKE_TEST_PASSWORD=<기존 가구 계정 비밀번호> \
SMOKE_INVITE_EMAIL=<새 테스트 계정 이메일> \
SMOKE_INVITE_PASSWORD=<새 테스트 계정 비밀번호> \
SMOKE_INVITE_CREATE=true \
npm run smoke:firebase
```

초대 검증 범위:

- 초대 계정 로그인 또는 생성
- 초대 코드로 같은 가구의 member 문서 생성
- 초대 계정의 `activeHouseholdId` 연결
- 초대 계정의 가구 데이터 읽기
- 초대 계정의 CRUD 권한
- 일반 멤버의 `admin` role 상승 거부

## Mock 모드

Firebase 키 없이 화면만 확인할 때:

```bash
npm run web:mock
```

정적 mock 빌드:

```bash
npm run export:web:mock
```

## 데모 데이터

디자인 QA나 화면 캡처용으로 같은 상태를 반복 확인할 때 데모 데이터를 다시 만들 수 있다.

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
npm run demo:seed
```

`demo:seed`는 현재 로그인 계정의 활성 가구에 `[demo]` 항목 4개를 만든다. 실행 전 같은 가구 안의 `memo`가 `[codex-demo-data]`인 활성 기능 항목만 먼저 삭제한다. MVP 제외 기능의 기존 데이터는 건드리지 않는다.

데모 항목만 삭제:

```bash
SMOKE_TEST_EMAIL=<테스트 계정 이메일> \
SMOKE_TEST_PASSWORD=<테스트 계정 비밀번호> \
npm run demo:reset
```
