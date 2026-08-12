# 알림 구현 메모

## 현재 구현

- `expo-notifications`를 사용한다.
- 홈 화면의 `알림 준비 상태`에서 정책 기준 대상 수를 보여준다.
- `로컬 알림 예약` 버튼을 누르면 현재 가구 데이터 기준으로 로컬 알림을 예약한다.
- `예약 취소` 버튼을 누르면 앱이 예약한 로컬 알림을 모두 취소한다.
- 웹 미리보기에서는 Expo 로컬 알림 예약을 지원하지 않으므로 안내 메시지만 표시한다.

## 예약 정책

- 지출: 납부 완료가 아닌 항목 중 `notificationEnabled=true`인 항목을 납부일 오전 9시에 예약한다.
- 냉장고: 보관 중이고 유통기한이 3일 이내이며 `notificationEnabled=true`인 항목을 유통기한 3일 전 오전 9시에 예약한다.
- 과거 시간이 된 알림은 예약하지 않으며, 홈의 알림 대상 수에서도 제외한다.

## 구현 위치

- 예약 대상 계산: `src/services/notification-service.ts`
- 예약 정책 계산: `src/utils/reminder-policy.ts`
- 홈 요약 계산: `src/utils/dashboard.ts`
- 예약 실행 액션: `src/store/household-store.ts`
- UI 진입점: `src/app/index.tsx`

## 다음 단계

- 실제 기기에서 권한 요청과 로컬 알림 수신을 확인한다.
- 원격 푸시가 필요해지면 Expo Push Token 저장 컬렉션을 추가한다.
- 서버 발송이 필요해지면 가구원별 알림 정책과 토큰 갱신 로직을 분리한다.
