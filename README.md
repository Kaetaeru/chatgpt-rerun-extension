# chatgpt-rerun-extension

GitHub에 보존된 작업 상태를 기준으로 중단된 ChatGPT 장기 작업을 제한적으로 자동 재실행하는 Manifest V3 Chrome 확장프로그램이다.

핵심 원칙은 **ChatGPT 답변을 파싱하지 않고 GitHub를 source of truth로 사용**하는 것이다.

## 동작 개요

v0.2.4부터 Chrome 탭 watcher와 GitHub work state는 서로 독립적이다.

```text
Side Panel Start
      │
      ▼
Tab watcher = Watching
      │
      ├─ 설정된 주기로 GitHub control polling
      │
      ├─ continue ─────────────→ 재개 프롬프트 전송
      │                         같은 sequence는 제한적 retry
      │
      ├─ complete ───────────┐
      ├─ needs_user ─────────┼→ dispatch 대기, watcher는 계속 polling
      └─ blocked ────────────┘

GitHub가 다시 continue가 되면
      │
      └──────────────→ Start를 다시 누르지 않아도 자동 재개
```

`complete`, `needs_user`, `blocked`는 **Chrome Stop이 아니다.** 현재 GitHub 작업을 시작하지 않는 상태일 뿐이다. watcher가 켜져 있으면 탭/확장프로그램이 살아 있는 동안 계속 control을 확인한다.

## Tab watcher와 GitHub work status

Side Panel은 두 상태를 별도로 표시한다.

- **Tab watcher**: `Watching` / `Stopped`
- **GitHub work status**: `continue · start` / `complete` / `needs_user` / `blocked`

Start/Stop은 watcher에만 적용된다.

```text
Stopped  → [ Start ] → Watching
Watching → [ Stop  ] → Stopped
```

GitHub가 `complete`가 되어도 watcher는 `Watching`을 유지한다. 이후 같은 sequence 또는 새 sequence가 `continue`가 되면 자동 실행을 다시 시도한다. same-sequence terminal → continue는 일반 retry가 아니라 새 작업 허가로 취급한다.

동일 owner/repo/branch/control path는 동시에 한 탭 watcher만 소유할 수 있다.

## GitHub Live Status

사용자가 PLAN/STATE/control을 직접 해석하지 않아도 되도록 `.chatgpt-rerun/STATUS.md`를 사람용 현황판으로 유지한다.

STATUS에는 현재 run/sequence/status/task, 현재 작업, 전체 진행표, 최근 검증, 사용자 행동, 다음 자동 작업, blocker/risk를 표시한다.

- 의미 있는 상태 변화가 있으면 즉시 갱신한다.
- 긴 실행은 약 5분 freshness를 목표로 안전한 체크포인트에서 갱신한다.
- 18분 time-budget checkpoint와 실행 종료 전 내용이 달라졌다면 갱신한다.
- 내용이 같으면 시각만 바꾸는 heartbeat commit은 만들지 않는다.
- 비밀, GitHub token, 민감한 입력은 기록하지 않는다.

**STATUS는 presentation-only다.** 자동 재개/reconciliation은 `control.json` / `STATE.md` / `PLAN.md`를 사용한다.

## 20-minute execution policy

한 번의 ChatGPT 실행은 반드시 20분 전에 종료한다. 전체 sequence가 아니라 개별 turn 기준이다.

- 실행 시작 시 hard deadline을 계산한다.
- 약 18분부터 새 장기 작업을 시작하지 않고 STATE 체크포인트를 우선한다.
- 미완료 task는 같은 `continue` sequence를 유지한다.
- 검증하지 않은 작업을 시간 때문에 verified 처리하지 않는다.
- 다음 same-sequence retry는 새로운 20분 예산으로 이어서 수행한다.

상세 규칙은 `.chatgpt-rerun/README.md`와 `docs/PROJECT_PROTOCOL.md`에 있다.

## Per-tab persistent Side Panel

설정 UI는 Chrome Side Panel에서 열린다. 설정/config/runtime/draft는 Chrome tab ID별로 분리된다.

- 확장 아이콘을 클릭하면 현재 ChatGPT 탭 전용 Side Panel이 열린다.
- Side Panel을 닫았다 다시 열어도 해당 탭 draft가 복원된다.
- 서로 다른 GitHub stream은 여러 ChatGPT 탭에서 독립적으로 감시할 수 있다.
- 동일 GitHub stream의 두 번째 watcher Start는 거부한다.
- 탭이 닫히면 그 tab ID의 설정/runtime/draft가 제거된다.

## Rerun 연결 프롬프트

새 프로젝트는 보통 GitHub repository가 이미 있고, 현재 ChatGPT 대화도 어느 repo에서 작업하는지 알고 있다. v0.2.3부터 Side Panel의 **Rerun 연결 프롬프트**가 기본 온보딩이다.

권장 흐름:

```text
프로젝트 repo를 이미 사용하는 ChatGPT 대화
        ↓
Rerun 연결 프롬프트
        ↓
ChatGPT가 repo/branch 식별
        ↓
.chatgpt-rerun/
  README.md
  PLAN.md
  STATE.md
  STATUS.md
  control.json
생성 또는 안전한 보완
        ↓
연결 프롬프트 종료
        ↓
Side Panel에서 좌표 확인 후 Start
```

안전 규칙:

- current conversation의 GitHub 맥락을 우선한다. Side Panel 좌표는 힌트다.
- repo 후보가 둘 이상이거나 불확실하면 파일을 쓰지 않고 사용자에게 확인한다.
- 기존 active run이 있으면 run_id/sequence/task/검증 기록을 초기화하지 않는다.
- 새 프로젝트는 PLAN → STATE → `control.json` 순서로 만들고 control을 마지막 authoritative write로 게시한다.
- 연결 프롬프트 자체는 실제 구현 task를 시작하지 않는다.
- watcher가 Watching인 동안 연결 프롬프트 버튼은 비활성화된다.

## Start fallback bootstrap

연결 프롬프트를 건너뛰었더라도 v0.2.2 fallback을 유지한다.

Start 시 기본 `.chatgpt-rerun/control.json`이 없고 repo/branch 자체가 실제로 읽히면 ChatGPT에 bootstrap prompt를 한 번 보낸다. ChatGPT가 5개 표준 문서를 생성/보완하고 control을 마지막에 게시한 뒤, watcher가 control을 감지해서 일반 resume prompt를 시작한다.

- custom missing control path는 자동 생성하지 않는다.
- 접근할 수 없는 repo/branch를 새 프로젝트로 오인하지 않는다.
- bootstrap 동안 normal sequence claim과 new-chat handoff를 억제한다.
- 확장프로그램 GitHub token은 read/polling 용도다. 파일 쓰기는 연결된 ChatGPT GitHub 앱이 담당한다.

## Continue in new chat

대화 컨텍스트가 길어졌다면 **Continue in new chat**으로 watcher ownership을 새 ChatGPT 탭에 이관한다.

- 새 ChatGPT 탭을 연다.
- 기존 탭은 handoff 중 polling을 잠시 멈춘다.
- 같은 GitHub config/runtime ownership을 새 tab ID로 이관한다.
- 새 채팅에는 owner/repo, branch, control path, run_id, sequence가 포함된 handoff prompt를 보낸다.
- 이전 대화 본문은 복사하지 않고 GitHub README/control/STATE/PLAN에서 복구한다.
- handoff 자체 때문에 GitHub sequence를 증가시키지 않는다.
- GitHub work status가 terminal이면 handoff 요청은 거부하지만 기존 watcher는 계속 Watching 상태를 유지한다.

확장프로그램은 ChatGPT의 앱 승인/OAuth/관리자 승인 UI를 자동 클릭하지 않는다.

## 대상 저장소 표준

```text
.chatgpt-rerun/
├── README.md
├── PLAN.md
├── STATE.md
├── STATUS.md
└── control.json
```

- `README.md`: 운영 계약과 mandatory read order.
- `PLAN.md`: 전체 계획, 의존성, acceptance criteria.
- `STATE.md`: 중단 복구 체크포인트와 실제 검증 결과.
- `STATUS.md`: 사람이 읽는 live dashboard. reconciliation에는 사용하지 않음.
- `control.json`: GitHub work signal.

템플릿은 `templates/repository/.chatgpt-rerun/`에 있다.

## Control 상태

v1은 네 상태만 허용한다.

- `continue`: 현재 sequence 작업 시작/재개.
- `complete`: 현재 계획/작업 완료. watcher는 계속 polling 가능.
- `needs_user`: 사람의 결정 필요. watcher는 계속 polling 가능.
- `blocked`: 현재 자동 진행 불가. watcher는 계속 polling 가능.

`working` 상태는 사용하지 않는다.

예시:

```json
{
  "version": 1,
  "run_id": "project-alpha-20260816-01",
  "sequence": 12,
  "status": "continue",
  "reason": "TASK-011 verified; TASK-012 is ready.",
  "updated_at": "2026-08-16T12:30:00Z",
  "task_id": "TASK-012"
}
```

정식 스키마는 `schemas/control.schema.json`에 있다.

## 중요한 쓰기 순서

권위 있는 상태 전환은 반드시:

1. `PLAN.md`
2. `STATE.md`
3. **`control.json` 마지막 authoritative write**

그 뒤 STATUS를 presentation-only로 갱신할 수 있다.

## 설치

1. 최신 브랜치를 clone/update한다.
2. `chrome://extensions`에서 Developer mode를 켠다.
3. 처음이면 Load unpacked, 이미 로드했다면 Reload한다.
4. ChatGPT 탭에서 확장 아이콘을 눌러 Side Panel을 연다.
5. 새 프로젝트면 `Rerun 연결 프롬프트`로 Rerun 문서를 준비한다.
6. Owner / Repository / Branch / Control file을 확인한다.
7. `Start`를 눌러 현재 탭 watcher를 켠다.
8. watcher가 켜져 있으면 버튼은 `Stop`으로 표시된다.
9. GitHub work status가 terminal이어도 watcher는 polling을 계속한다.
10. `.chatgpt-rerun/STATUS.md`에서 사람이 읽을 수 있는 진행 상태를 확인한다.

## GitHub 접근

공개 저장소는 token 없이 읽을 수 있으며 비인증 polling은 최소 60초다. 빠른 polling 또는 private repo는 대상 contents read 권한으로 제한된 token을 사용한다.

확장프로그램 token은 control polling과 repo/branch 존재 확인용이다. bootstrap/STATUS 파일 쓰기는 연결된 ChatGPT GitHub 앱이 담당한다.

## 안전 장치

다음 상황은 watcher를 유지한 채 dispatch를 보류할 수 있다.

- `complete`, `needs_user`, `blocked`
- sequence 회귀
- retries/sequence 한도
- max sends 한도

다음 브라우저 안전 문제는 watcher를 명시적으로 중지할 수 있다.

- 사용자가 Side Panel Stop을 누름
- ChatGPT composer에 사용자 draft가 존재
- content script / prompt 전송 실패
- bootstrap/handoff send failure
- 탭 종료

ChatGPT 또는 GitHub rate/service limit을 우회하도록 재시도하지 않는다.

## E2E dogfood

현재 v0.2.x 실제 Chrome 검증은 `docs/V02_E2E_TEST_PLAN.md`를 따른다. 결과는 `docs/V02_E2E_RESULT.md`에 누적한다.

검증 범위에는 per-tab isolation, same-stream collision guard, dispatch/retry, fresh-chat handoff, persistent watcher across terminal GitHub work states, unified Start/Stop watcher, explicit connection onboarding, fallback bootstrap이 포함된다.

## 개발

```bash
npm run check
npm test
```

`npm test`는 control parser/schema, polling/retry, UI watcher semantics, connection/bootstrap flow, terminal watcher behavior 회귀를 검증한다.
