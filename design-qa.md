# 디자인 QA

## 기준

- Source visual truth
  - `design_handoff_household_app/README.md`
  - `design_handoff_household_app/ios-frame.jsx`
  - `src/constants/theme.ts`
- 구현 화면: `design-qa-assets/responsive-home-402.jpg`
- 검증 뷰포트: 320 x 700, 375 x 812, 402 x 874
- 상태: 로그인 완료, 2인 가구, Firebase 데모 데이터 표시

초기 HTML 프로토타입은 최신 MVP보다 넓은 범위를 담고 있어 구현 기준에서 제외했다. 현재 색상, 타이포, 간격, 카드 구조는 앱 테마와 README 명세를 기준으로 확인한다.

## 비교 증거

- 최종 전체 화면 비교: `design-qa-assets/comparison-home-refined.png`
- 홈 상단 집중 비교: `design-qa-assets/comparison-home-focused.png`
- 원본 동일 뷰포트 캡처: `design-qa-assets/reference-home-402x874.jpg`
- 반응형 핵심 화면
  - `design-qa-assets/responsive-home-320.jpg`
  - `design-qa-assets/responsive-profile-320.jpg`
  - `design-qa-assets/responsive-expenses-list-320.jpg`
  - `design-qa-assets/responsive-expenses-dashboard-320.jpg`
  - `design-qa-assets/responsive-fridge-list-320.jpg`
  - `design-qa-assets/responsive-fridge-dashboard-320.jpg`
  - `design-qa-assets/responsive-calendar-320.jpg`
  - `design-qa-assets/responsive-home-375.jpg`
  - `design-qa-assets/responsive-home-402.jpg`
- 주요 구현 화면
  - `design-qa-assets/implementation-calendar.jpg`
  - `design-qa-assets/implementation-expenses-list.jpg`
  - `design-qa-assets/implementation-expenses-dashboard.jpg`
  - `design-qa-assets/implementation-expense-form.jpg`
  - `design-qa-assets/implementation-fridge-list.jpg`
  - `design-qa-assets/implementation-profile-sheet.jpg`

## 확인 결과

- `#FAF9F5` 배경, 흰색 카드, `#ECE8E1` 경계선 적용
- `#17B854` 핵심 액션과 상태 강조 적용
- Noto Sans KR 및 제목·본문 위계 적용
- 320~402px 모바일 폭에서 텍스트 잘림과 요소 겹침 없음
- 하단 탭 4개 라벨의 말줄임 없음
- 세그먼트 선택 후 불필요한 포커스 외곽선 없음
- 긴 이메일형 가구원 이름은 짧은 화면용 이름으로 표시
- 지출 목록의 제목·금액·메타 문구가 한 글자만 다음 줄로 밀리지 않음
- 하단 4개 탭, FAB, 세그먼트, 폼, 마이페이지 시트가 현재 MVP 구조와 일치
- 실제 Firebase 데이터가 홈, 캘린더, 목록, 대시보드에 연결됨

## 상호작용

- 4개 탭 이동
- 캘린더 날짜 선택 및 일정 추가
- 지출 생성·수정·삭제, 목록·대시보드 전환
- 냉장고 생성·수정·삭제, 목록·대시보드 전환
- 마이페이지 열기·닫기, 알림 스위치, 로그아웃
- 로그인·회원가입 전환, 입력 검증, 재로그인
- 가구 생성 입력 검증, 초대 코드 참여·재참여
- 등록 폼 필수값 미입력 시 저장 비활성화
- 새로고침 후 Firebase 데이터 유지

## 반복 수정

1. handoff 토큰과 모바일 레이아웃을 공통 컴포넌트에 반영
2. 실제 2인 가구 데모 데이터로 모든 주요 상태 확인
3. 웹 기본 주황색 포커스를 브랜드 초록색 키보드 포커스로 교체
4. 마이페이지 알림 패널의 불필요한 마지막 경계선 제거
5. 하단 탭 라벨을 고정 폭 커스텀 라벨로 교체하고 폰트 스케일 고정
6. 320px에서 마이페이지 역할 문구가 세로로 쪼개지는 문제 수정
7. 이메일형 가구원 이름을 일관된 화면용 이름으로 정리
8. 지출 목록을 2단 정보 구조로 바꿔 메타 문구의 고아 글자 제거
9. 세그먼트 줄바꿈과 클릭 후 포커스 외곽선 제거
10. 마이페이지 바깥 영역을 눌러도 닫히지 않던 문제 수정
11. 선택 입력값이 없는 항목의 Firebase 저장 실패 수정
12. 수정 시 비운 선택값이 Firestore에 남던 문제 수정
13. 기존 가구원이 초대 코드로 재참여할 때 발생하던 권한 오류 수정

## 기술 확인

- TypeScript: 통과
- ESLint: 통과
- 웹 정적 빌드: 통과
- Firebase 2인 가구 초대 및 CRUD 스모크 테스트: 통과
- 브라우저 기능 점검 33개 흐름: 통과
- 브라우저 콘솔 오류: 0건
- 브라우저 개발 경고: 0건

final result: passed
