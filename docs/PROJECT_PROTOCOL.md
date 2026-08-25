# ChatGPT Rerun Project Protocol v1.2

이 문서는 ChatGPT Rerun을 여러 GitHub 저장소에서 동일하게 사용하기 위한 표준 프로토콜이다.

## 1. 표준 디렉터리

```text
.chatgpt-rerun/
├── README.md      # 매 실행 먼저 읽는 운영 계약
├── PLAN.md        # 전체 목표, task, acceptance criteria
├── STATE.md       # 현재 sequence 복구 체크포인트
├── STATUS.md      # 사람이 읽는 live dashboard
└── control.json   # GitHub work signal
```

템플릿은 `templates/repository/.chatgpt-rerun/`에 있다.

## 2. Source of truth

- PLAN: 무엇을 완료해야 하는가.
- STATE: 지금 어디까지 했고 다음 control에 무엇을 게시해야 하는가.
- control: run/sequence/status/task의 최소 machine signal.
- STATUS: 사람이 읽는 presentation-only projection.

STATUS는 reconciliation source of truth가 아니다. 충돌 시 PLAN/STATE/control을 우선한다.

## 3. Mandatory read order

모든 자동/수동 Rerun 실행은:

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. `.chatgpt-rerun/STATUS.md`
6. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
7. 현재 task 관련 코드/테스트/최근 변경

순서로 읽고, 코드 작업 전에 control/STATE reconciliation을 수행한다.

## 4. Chrome tab watcher와 GitHub work state

v0.2.4부터 **Chrome watcher on/off**와 **GitHub work status**는 별도 축이다.

### Chrome watcher

- Side Panel `Start`: 현재 ChatGPT 탭 watcher를 켠다.
- Side Panel `Stop`: 현재 탭 watcher를 끈다.
- watcher가 켜져 있으면 설정된 poll interval로 control을 계속 확인한다.
- 동일 owner/repo/branch/control path는 동시에 한 watcher만 소유할 수 있다.
- 탭이 닫히면 해당 tab runtime/config/draft가 제거된다.

### GitHub work state

| status | 의미 | watcher가 켜진 탭의 동작 |
|---|---|---|
| `continue` | 현재 sequence 작업 시작/재개 허가 | 안전 조건 충족 시 resume prompt 전송 |
| `complete` | 현재 계획/작업 완료 | dispatch 대기, polling 계속 |
| `needs_user` | 사람 입력/결정 필요 | dispatch 대기, polling 계속 |
| `blocked` | 현재 자동 진행 불가 | dispatch 대기, polling 계속 |

terminal 상태는 Chrome Stop이 아니다.

terminal 상태 뒤 `continue`가 오면 사용자가 Start를 다시 누르지 않아도 자동 재개한다. 같은 sequence가 terminal -> `continue`로 바뀐 경우에도 새 work authorization으로 취급해 즉시 dispatch할 수 있어야 한다.

Max sends, retry limit, sequence regression은 dispatch를 보류할 수 있지만 watcher 자체를 끄지 않는다. composer draft 보호, prompt send failure, bootstrap/handoff failure처럼 브라우저 안전을 위해 명시적 중지가 필요한 경우는 예외다.

## 5. `control.json` schema

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

- version: 현재 1.
- run_id: 하나의 자동 흐름 동안 유지.
- sequence: 0 이상의 정수.
- status: `continue`, `complete`, `needs_user`, `blocked`만 허용.
- updated_at: ISO-8601.
- reason/task_id: 선택 필드.

`working`은 사용하지 않는다.

## 6. Sequence 규칙

- 같은 task 수행 중 sequence 유지.
- 새 task 또는 terminal state 전환 때만 증가.
- 정상 흐름에서 감소 금지.
- 동일 자동 흐름에서는 run_id 유지.
- 20분 checkpoint로 미완료 종료 시 sequence 유지.

확장프로그램은 same-sequence `continue`를 제한적으로 retry한다. terminal 상태는 retry를 발생시키지 않는다. terminal -> 같은-sequence `continue`는 retry가 아니라 새 dispatch 허가다.

## 7. Preflight reconciliation

정상 상태에서 control과 STATE는 동일 run/sequence/status/task를 가리킨다.

### Normal

- run_id 일치
- sequence 일치
- STATE Desired control status == control.status
- STATE Current task == control.task_id

이면 현재 sequence를 실행/재개한다.

### Recoverable pending handoff

STATE.Sequence가 control.sequence보다 정확히 1 크고 PLAN/STATE가 이전 task 검증 완료와 다음 intended 상태를 명확히 기록하면:

1. 이전 task 반복 금지.
2. STATE에 기록된 intended control만 게시.
3. updated_at만 현재 시각으로 갱신.
4. 이번 실행에서 새 task 시작 금지.
5. 필요하면 STATUS 갱신 후 종료.

### Unsafe mismatch

run_id mismatch, control ahead, STATE 2+ ahead, same-sequence status/task contradiction은 추측으로 진행하지 않는다. PLAN/STATE에 문제를 기록하고 안전하게 새 `needs_user` 상태를 **PLAN -> STATE -> control** 순서로 게시한다. watcher가 켜져 있다면 needs_user 상태에서도 polling은 계속된다.

## 8. Authoritative write transaction

상태 전환은 항상:

1. PLAN
2. STATE
3. **control.json 마지막 authoritative write**
4. 필요하면 STATUS presentation update

순서다.

control 이후 STATUS 쓰기가 실패해도 authoritative 상태는 유효하다.

## 9. 20-minute execution budget

한 번의 ChatGPT turn은 반드시 20분 전에 종료한다.

- 시작 시 STATE에 execution start와 hard deadline 기록.
- 약 18분부터 새 장기 작업 금지.
- 완료/검증/미완료/Next Exact Action 체크포인트 우선.
- task 미완료면 같은 sequence + `continue` 유지.
- 검증 없이 verified/complete 금지.
- 20분 전에 종료하고 다음 retry에서 이어감.

## 10. STATUS freshness

STATUS는 사람이 GitHub에서 현재 상황을 빠르게 이해하기 위한 파일이다.

최소 포함:

- Last updated
- run/sequence/control status/current task
- 현재 activity
- progress table
- 최근 검증
- 사용자 행동
- 다음 자동 작업
- blockers/risks

갱신:

- 의미 있는 상태/task/blocker/검증 변화 시 즉시.
- 긴 실행은 약 5분 freshness를 목표로 안전한 checkpoint에서.
- 18분 checkpoint/종료 전 내용이 바뀌었으면 갱신.
- 내용이 같으면 heartbeat commit 금지.
- 비밀/token/민감 입력 금지.

## 11. Task transitions

### 다음 task

PLAN current task verified -> STATE sequence +1 / next task / `continue` -> control 마지막 게시.

### complete

PLAN 전체 완료 -> STATE next sequence / `complete` -> control 마지막 게시 -> STATUS 완료 표시.

`complete`는 watcher Stop이 아니다. watcher가 켜져 있으면 다음 GitHub `continue`를 기다린다.

### needs_user

STATE에 질문/선택지 기록 -> next sequence / `needs_user` -> control 마지막 게시 -> STATUS에 정확한 사용자 행동 표시.

watcher는 계속 polling할 수 있다.

### blocked

STATE에 원인/시도/남은 blocker 기록 -> next sequence / `blocked` -> control 마지막 게시 -> STATUS blocker 표시.

watcher는 계속 polling할 수 있다.

## 12. Rerun project onboarding

권장 온보딩은 Side Panel의 **Rerun 연결 프롬프트**다.

- 현재 대화의 GitHub 맥락에서 repo/branch를 식별한다.
- 후보가 여러 개면 쓰지 말고 사용자에게 확인한다.
- README/PLAN/STATE/STATUS/control을 생성 또는 호환 보완한다.
- 기존 active run은 run_id/sequence/task/verification을 초기화하지 않는다.
- 새 프로젝트 control은 PLAN/STATE 이후 마지막 authoritative write로 sequence 0 / `continue` 게시한다.
- 연결 prompt 자체에서는 실제 구현 task를 시작하지 않는다.

연결 프롬프트를 건너뛴 경우 standard control path가 없는 readable repo에 대해 Start fallback bootstrap을 사용할 수 있다. custom missing path나 unreadable repo는 자동 생성하지 않는다.

## 13. New-chat handoff

- handoff 중 old watcher는 `handoffPending`으로 normal polling을 잠시 중단한다.
- 성공 시 new tab이 same run/sequence watcher ownership을 이어받고 old tab watcher는 중지한다.
- 이전 대화 본문은 복사하지 않고 GitHub state에서 복구한다.
- GitHub work status가 terminal이면 handoff 요청은 거부하지만 old watcher는 계속 켜둔다.
- prompt 전송 실패 후 ownership이 이미 이전됐다면 new watcher는 `handoff_send_failed`로 중지한다.

## 14. Verification

실행하지 않은 테스트/lint/build/E2E를 PASS라고 쓰지 않는다. acceptance criteria가 충족되지 않으면 complete를 게시하지 않는다.

## 15. Recovery requirement

STATE는 다음 실행이 이전 대화 내용을 몰라도 바로 이어갈 수 있게 최소한 다음을 유지한다.

- run ID / sequence / desired control status / current task
- phase
- execution start / hard stop
- 완료 내용
- 실제 검증 결과
- 미완료 항목
- 변경 파일/영역
- Next Exact Action

STATUS는 복구 input이 아니다.
