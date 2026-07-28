# 데이터 모델 초안

PRD의 모델을 TypeScript 타입과 Firestore 컬렉션으로 옮긴 기준 문서다.

## 핵심 엔티티

- `Household`: 가구 이름, 초대 코드, 생성자
- `HouseholdMember`: 사용자, 역할, 참여 일시
- `Expense`: 지출명, 유형, 금액, 납부일, 납부자, 분담 비율, 상태
- `Chore`: 집안일명, 담당자, 수행일, 반복 주기, 점수, 상태
- `FridgeItem`: 식재료명, 카테고리, 수량, 보관 위치, 유통기한, 상태, 알림 여부

## Firestore 컬렉션

- `users/{uid}`: 이메일, 표시 이름, 현재 활성 가구 ID
- `households/{householdId}`: 가구 이름, 초대 코드, 생성자
- `households/{householdId}/members/{uid}`: 가구원 이름, 역할, 참여일
- `households/{householdId}/expenses/{expenseId}`: 공동 지출
- `households/{householdId}/chores/{choreId}`: 집안일
- `households/{householdId}/fridgeItems/{itemId}`: 냉장고 항목
- `inviteCodes/{code}`: 초대 코드와 가구 ID 매핑

## MVP 정책

- 한 사용자는 MVP에서 하나의 가구에 속한다.
- 실제 계좌번호나 카드번호는 받지 않고 사용자가 알아볼 수 있는 별칭만 저장한다.
- 지출은 MVP에서 납부자와 분담 비율까지 저장하고, 송금/정산 완료 플로우는 P1로 둔다.
- 냉장고 항목은 유통기한이 없어도 등록할 수 있다.
- 집안일 점수는 1, 2, 3, 5점 템플릿을 기본값으로 둔다.
- MVP에서는 실제 푸시 발송 전에 `notificationEnabled`를 저장한다.
- 알림 기본값은 지출, 집안일, 냉장고 모두 켬이며, 냉장고는 유통기한 3일 전 기준으로 다음 알림 연동 단계에서 사용한다.
- 홈 화면은 현재 저장된 알림 정책 기준으로 지출, 집안일, 냉장고 알림 대상 수를 표시한다.
- Expo Notifications 로컬 알림 예약은 홈 화면에서 실행한다.
- 로컬 알림 예약 취소도 홈 화면에서 실행한다.
- 웹 미리보기에서는 로컬 알림 예약 대신 지원 제한 메시지를 보여준다.
