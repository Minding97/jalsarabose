# 내부망 QA 자동화

## 역할

- 내부망 웹의 모든 화면에서 Bug와 Task를 제보한다.
- 화면 조작과 입력값을 Recording으로 수집한다.
- Jira에 비공개 티켓과 암호화된 Recording을 즉시 생성한다.
- 매일 00:30~07:00에 Codex가 대기 티켓을 순차 수정한다.
- Claude CLI 리뷰와 GitHub 검증을 통과한 PR만 자동 머지한다.

## 1. Jira 준비

Jira Free에서 Software 프로젝트를 만들고 프로젝트 키를 `JAL`로 정한다.

필요한 이슈 유형:

- Bug
- Task
- Sub-task

필요한 상태:

- 자동수정 대기
- 수정 중
- 리뷰 중
- 사람 확인 필요
- 완료

모든 이슈 유형이 위 상태로 이동할 수 있도록 워크플로를 연결한다.

## 2. 로컬 설정

```bash
npm run qa:setup
```

생성된 `~/.config/jalsarabose/qa.env`에서 아래 항목을 채운다.

```text
JIRA_BASE_URL=https://YOUR-SITE.atlassian.net
JIRA_EMAIL=Atlassian 계정 이메일
JIRA_API_TOKEN=Atlassian API 토큰
JIRA_PROJECT_KEY=JAL
JIRA_BUG_TYPE=Bug
JIRA_TASK_TYPE=Task
JIRA_SUBTASK_TYPE=Sub-task
QA_TEST_EMAIL=QA 전용 앱 이메일
QA_TEST_PASSWORD=QA 전용 앱 비밀번호
```

이슈 유형과 상태 이름은 Jira 프로젝트에 표시되는 언어와 정확히 같아야 한다.

`QA_RECORDING_KEY`는 setup 명령이 자동 생성한다. 이 파일과 키를 git, Notion, Jira에 올리지 않는다.
테스트 계정은 로그인 화면에서 시작하지 않은 Recording을 자동 재현할 때만 사용한다.

## 3. Claude CLI

Claude Code를 설치하고 Pro 또는 Max 계정으로 로그인한다.

```bash
npm install -g @anthropic-ai/claude-code
claude
```

야간 리뷰는 Claude CLI의 비대화형 JSON 모드를 사용한다. API 키는 사용하지 않는다.

## 4. 내부망 실행

```bash
npm run qa:lan
```

- 앱: `http://내부망-IP:8081`
- QA 게이트웨이: `http://내부망-IP:8787`

`npm run web`에는 QA 버튼이 나타나지 않는다.

QA Recording에는 로그인 이메일과 비밀번호가 포함될 수 있다. 실제 서비스 계정이나 다른 곳에서 재사용하는 비밀번호는 입력하지 않는다.

## 5. 야간 작업

설정 확인:

```bash
npm run qa:nightly:dry
```

macOS 예약 작업 설치:

```bash
npm run qa:install-schedule
```

처리 규칙:

- 00:30부터 Jira의 모든 `자동수정 대기` 티켓을 순차 처리한다.
- Recording이 있으면 수정 전과 수정 후에 같은 조작을 자동 재생한다.
- 티켓 처리 후 큐를 다시 조회해 실행 중 접수된 티켓도 포함한다.
- 07:00이 되면 새 티켓 시작을 멈추고 남은 티켓은 다음 날 이어서 처리한다.
- 한 티켓 실패는 다음 티켓 처리를 막지 않는다.
- Claude P0~P2는 Jira Sub-task로 생성한다.
- 3회 리뷰 후에도 차단 항목이 남으면 `사람 확인 필요`로 이동한다.

## 6. GitHub 설정

GitHub CLI 로그인 후 설정을 한 번 적용한다.

```bash
gh auth login
npm run qa:configure-github
```

`main`에는 다음 규칙을 사용한다.

- Pull Request 필수
- 대화 해결 필수
- `verify` 상태 검사 필수
- `claude-review` 상태 검사 필수
- squash merge
- auto-merge
- 병합 후 브랜치 삭제

Recording과 입력값은 공개 PR에 포함하지 않는다.

## 7. 보관

- Recording은 Jira에 AES-256-GCM 암호문으로 저장한다.
- Firebase·Jira·GitHub 인증정보는 암호화 전에 제거한다.
- 복호화 파일은 티켓 처리용 임시 worktree와 함께 삭제한다.
- 완료 후 30일이 지난 암호화 Recording은 야간 작업에서 삭제한다.
- 사람이 읽는 `trace.json`에는 입력값 대신 값의 존재 여부만 남긴다.
