# 알림 구현 메모

## 현재 구현

- `expo-notifications`를 사용한다.
- 마이페이지에서 지출·유통기한 알림 설정을 사용자별 `users/{uid}` 문서에 저장한다.
- 설정이나 가구 항목의 실시간 스냅샷이 변경되면 현재 사용자 기준 예약을 자동으로 갱신한다.
- 앱이 만든 생활 알림만 취소·재생성하며 다른 로컬 알림은 건드리지 않는다.
- 웹 미리보기에서는 Expo 로컬 알림 예약을 지원하지 않으므로 안내 메시지만 표시한다.

## 예약 정책

- 공통: 기준일 3일 전·1일 전·당일 오전 9시에 예약하며 과거가 된 시각은 제외한다.
- 지출: 납부 완료가 아니고 `notificationEnabled=true`인 항목을 지정된 납부자의 기기에만 예약한다.
- 냉장고: 보관 중이고 유통기한과 `notificationEnabled=true`가 있는 항목을 해당 사용자 설정에 따라 예약한다.
- 식별자는 사용자·종류·항목·기준일 조합으로 고정하고 같은 식별자는 한 번만 예약한다.

## 구현 위치

- 예약 대상 계산: `src/services/notification-service.ts`
- 예약 정책 계산: `src/utils/reminder-policy.ts`
- 예약 실행 액션: `src/store/household-store.ts`
- UI 진입점: `src/components/profile-sheet.tsx`

## 다음 단계

- 실제 기기에서 권한 요청과 로컬 알림 수신을 확인한다.
- 원격 푸시가 필요해지면 Expo Push Token 저장 컬렉션과 토큰 갱신 로직을 추가한다.
