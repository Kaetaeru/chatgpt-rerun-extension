# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md` — 이 계약
2. `.chatgpt-rerun/control.json` — 현재 run/sequence와 GitHub work state
3. `.chatgpt-rerun/STATE.md` — 마지막 복구 체크포인트와 intended control handoff
4. `.chatgpt-rerun/PLAN.md` — 전체 계획과 acceptance criteria
5. `.chatgpt-rerun/STATUS.md` — 사람용 현황판. reconciliation에는 사용하지 않음
6. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
7. 현재 task 관련 코드, 테스트, 최근 변경사항

## Source-of-truth roles

- `PLAN.md`: 무엇을 완료해야 하는가.
- `STATE.md`: 지금 어디까지 했고 다음 control에 어떤 상태를 게시해야 하는가.
- `control.json`: GitHub 쪽 work state와 sequence/task를 표현하는 최소 machine signal.
- `STATUS.md`: 사용자가 현재 상황을 이해하는 presentation-only dashboard.

STATUS는 source of truth가 아니다. PLAN/STATE/control과 충돌하면 PLAN/STATE/control을 우선한다.

## Chrome watcher와 GitHub work state

Chrome Side Panel Start/Stop과 `control.status`는 별도 축이다.

- `Start`: 현재 ChatGPT 탭의 GitHub watcher를 켠다.
- `Stop`: 현재 탭 watcher를 끈다.
- watcher가 켜져 있으면 설정된 polling 주기로 control을 계속 확인한다.
- `continue`: 현재 sequence 작업 시작/재개 신호다.
- `complete`, `needs_user`, `blocked`: dispatch를 대기하지만 watcher는 계속 polling한다.
- terminal 상태 뒤 `continue`가 되면 사용자가 Start를 다시 누르지 않아도 자동 재개할 수 있어야 한다.
- 같은 sequence terminal -> continue도 새 work authorization으로 취급한다.
- max sends/retry limit/sequence regression 같은 guard는 dispatch를 보류할 수 있지만 watcher 자체를 자동 Stop하지 않는다.
- composer 보호, prompt 전송 실패 같은 브라우저 안전 오류는 watcher를 중지할 수 있다.

따라서 `complete`는 Chrome Stop이 아니라 "현재 작업 완료, 다음 GitHub work signal 대기"다.

## Human-readable live status

매 실행은 `.chatgpt-rerun/STATUS.md`를 사람이 이해하기 쉬운 형태로 유지한다.

최소 포함 항목:

- 마지막 갱신 시각
- run ID / sequence / control status / current task
- 현재 실제 activity
- task/milestone progress
- 최근 검증 사실
- 사용자 행동
- 다음 자동 작업
- blocker / risk
- freshness policy

갱신 규칙:

1. task/sequence/status/blocker/검증 결과/현재 행동이 의미 있게 바뀌면 즉시 갱신한다.
2. 긴 실행은 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신한다.
3. 18분 checkpoint와 실행 종료 전 내용이 달라졌다면 갱신한다.
4. 내용이 같으면 시각만 바꾸는 빈 commit은 만들지 않는다.
5. 비밀/token/민감 입력은 기록하지 않는다.

`control.json`은 상태 전환의 마지막 authoritative write다. STATUS는 그 뒤에 갱신할 수 있다.

## Preflight reconciliation

작업 시작 전 control과 STATE의 Run ID / Sequence / Desired control status / Current task를 비교한다. STATUS는 판단에 사용하지 않는다.

### Normal

run/sequence/status/task가 일치하면 현재 sequence를 실행/재개한다.

### Recoverable pending handoff

STATE sequence가 control보다 정확히 1 크고 PLAN/STATE가 이전 task 검증 완료와 새 desired status/task를 명확히 기록하면:

1. 이전 task를 반복하지 않는다.
2. STATE의 intended 상태로 control만 게시한다.
3. `updated_at`을 현재 시각으로 쓴다.
4. 새 task를 이번 실행에서 시작하지 않는다.
5. 필요하면 STATUS를 갱신하고 종료한다.

### Unsafe mismatch

run_id 불일치, control이 STATE보다 앞섬, STATE가 2 이상 앞섬, 같은 sequence의 status/task 모순은 자동 진행하지 않는다. STATE에 불일치를 기록하고 안전하게 새 `needs_user` 상태를 PLAN → STATE → control 순서로 게시한다. watcher가 켜져 있다면 이 `needs_user` 상태에서도 polling은 계속된다.

## Hard execution time budget

한 번의 ChatGPT 실행은 반드시 20분 전에 끝낸다.

1. 실행 시작 시 시작 시각과 20분 hard deadline을 STATE에 기록한다.
2. 약 18분부터 새 장기 작업을 시작하지 않는다.
3. STATE에 완료 내용, 실제 검증, 미완료 항목, `Next Exact Action`을 우선 기록한다.
4. task가 미완료면 같은 `continue` sequence를 유지한다.
5. 20분 전에 응답을 종료한다.
6. 다음 same-sequence retry는 새 20분 예산으로 이어간다.

## Execution rules

1. preflight reconciliation을 완료한다.
2. current run/sequence/task를 확정한다.
3. STATE의 미완료 체크포인트부터 재개한다.
4. verified 작업은 근거 없이 반복하지 않는다.
5. 구현 후 acceptance criteria를 실제 검증한다.
6. authoritative 상태 전환은 **PLAN → STATE → control.json** 순서다.
7. control은 마지막 authoritative write다.
8. STATUS 내용이 달라졌다면 presentation-only로 갱신한다.
9. 20분 hard deadline 전에 종료한다.

## Do not set `working`

작업 중에는 current `continue` + 같은 sequence를 유지한다. `working` 상태는 사용하지 않는다.

## Control transitions

현재 task가 verified되고 다음 task가 있으면 PLAN을 갱신하고 STATE sequence를 1 증가시켜 다음 task / `continue`로 만든 뒤 control을 마지막에 일치시킨다.

전체 계획이 완료되면 PLAN 완료 → STATE 다음 sequence / `complete` → control 마지막 순서로 게시한다. **complete가 되어도 Chrome watcher는 계속 polling할 수 있다.**

사용자 결정이 필요하면 STATE에 질문/선택지를 기록하고 다음 sequence / `needs_user`를 control에 게시한다. watcher는 계속 관찰할 수 있다.

자동 해결 불가능 blocker는 STATE에 원인/시도/남은 blocker를 기록하고 다음 sequence / `blocked`를 게시한다. watcher는 계속 관찰할 수 있다.

## Sequence invariants

- 같은 작업 중 sequence 유지.
- 새 task 또는 terminal 상태 전환 때만 증가.
- 감소 금지.
- 동일 흐름에서는 run_id 유지.
- 20분 checkpoint로 미완료 종료 시 sequence 유지.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. acceptance criteria가 충족되지 않으면 `complete`를 게시하지 않는다.

## Recovery requirement

STATE는 다음 실행이 이전 대화를 추측하지 않고 바로 이어갈 만큼 구체적이어야 한다. 최소한 run/sequence, desired control status, current task, phase, 실행 시작/마감, 완료 내용, 검증 결과, 미완료 항목, Next Exact Action을 유지한다.

STATUS는 복구용이 아니라 관찰용이다.
