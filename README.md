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

인증, 실시간 공유, 실제 푸시 발송은 다음 단계에서 백엔드 연결과 함께 구현합니다.

## 실행

```bash
npm install
npm run start
```

웹 프리뷰:

```bash
npm run web
```

정적 웹 빌드:

```bash
npx expo export --platform web
```

## 프로젝트 구조

```text
src/app/                 Expo Router 화면
src/components/app/      앱 공통 UI 컴포넌트
src/data/                MVP 샘플 데이터
src/domain/              PRD 기반 타입과 라벨
src/store/               클라이언트 상태 저장소
src/utils/               날짜/대시보드 계산 유틸
docs/                    제품/아키텍처 문서
```

## 다음 개발 순서

1. 디자인 확정 후 `src/components/app`의 토큰과 컴포넌트 스타일 반영
2. Firebase 또는 Supabase 중 백엔드 선택
3. 회원가입/로그인, 가구 생성, 초대 코드 플로우 구현
4. 지출/집안일/냉장고 등록 및 수정 폼 구현
5. Expo Notifications 기반 로컬/푸시 알림 연결
