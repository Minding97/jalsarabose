# 초기 아키텍처

## 선택 스택

Expo + React Native + TypeScript를 기준으로 시작한다. 모바일 앱, 푸시 알림, 웹 프리뷰, 실제 기기 테스트까지 한 번에 가져갈 수 있고 레퍼런스가 가장 넓은 축에 속한다.

## 현재 단계

현재 코드는 백엔드 연결 전의 MVP 앱 골격이다. 도메인 타입, 샘플 데이터, 화면별 요약 계산, 하단 탭 구조를 먼저 고정했다.

## 화면 구조

- `src/app/index.tsx`: 홈 대시보드
- `src/app/calendar.tsx`: 월간 캘린더와 날짜별 이벤트
- `src/app/expenses.tsx`: 지출 대시보드와 납부 상태
- `src/app/chores.tsx`: 집안일 목록과 완료 처리
- `src/app/fridge.tsx`: 냉장고 재고와 소진/폐기 처리

## 백엔드 연결 후보

### Firebase

- Auth, Firestore, Cloud Messaging 레퍼런스가 넓다.
- 가구 단위 실시간 공유와 푸시 알림까지 한 제품군에서 처리하기 쉽다.
- Expo와 함께 쓰는 사례가 많다.

### Supabase

- Postgres 기반 관계형 모델이 명확하다.
- SQL, Row Level Security, Realtime을 이용한 데이터 권한 설계가 좋다.
- 푸시 알림은 별도 서비스 또는 Edge Function 설계가 필요하다.

초기 MVP는 푸시 알림 요구가 강하므로 Firebase를 1순위 후보로 둔다.
