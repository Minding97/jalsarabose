# 초기 아키텍처

## 선택 스택

Expo + React Native + TypeScript를 기준으로 시작한다. 모바일 앱, 푸시 알림, 웹 프리뷰, 실제 기기 테스트까지 한 번에 가져갈 수 있고 레퍼런스가 가장 넓은 축에 속한다.

## 현재 단계

현재 코드는 Firebase 연결이 가능한 MVP 앱 골격이다. Firebase 설정이 있으면 Auth/Firestore를 사용하고, `EXPO_PUBLIC_USE_MOCKS=true`이면 샘플 데이터로 화면을 확인한다.

## 화면 구조

- `src/app/index.tsx`: 홈 대시보드
- `src/app/calendar.tsx`: 월간 캘린더와 날짜별 이벤트
- `src/app/expenses.tsx`: 지출 대시보드와 납부 상태
- `src/app/fridge.tsx`: 냉장고 재고와 소진/폐기 처리

MVP 제외 기능의 숨김 리다이렉트와 보존 데이터 경로는 [retired-feature-policy.md](./retired-feature-policy.md)의 호환 경계로만 유지한다.

## 백엔드

Firebase Auth + Firestore를 MVP 백엔드로 사용한다.

- Auth, Firestore, Cloud Messaging 레퍼런스가 넓다.
- 가구 단위 실시간 공유와 푸시 알림까지 한 제품군에서 처리하기 쉽다.
- Expo와 함께 쓰는 사례가 많다.

## 데이터 계층

- 화면은 Firebase SDK를 직접 호출하지 않는다.
- `src/services`가 Auth/Firestore 접근을 담당한다.
- `src/store/household-store.ts`가 인증 상태, 가구 상태, 실시간 구독, mock 모드를 관리한다.
- `src/utils/dashboard.ts`는 Firestore에서 온 데이터와 mock 데이터를 같은 방식으로 계산한다.

## 배포 전 필수 작업

- `firestore.rules`를 실제 Firebase 프로젝트에 배포한다.
- `EXPO_PUBLIC_USE_MOCKS=false` 상태에서 회원가입, 가구 생성, 초대 코드 참여를 검증한다.
- Firestore Security Rules 테스트를 Firebase Emulator 또는 Console Rules Playground에서 수행한다.
