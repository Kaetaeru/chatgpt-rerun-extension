# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md` — 이 계약
2. `.chatgpt-rerun/control.json` — 현재 run/sequence와 실행 상태
3. `.chatgpt-rerun/STATE.md` — 마지막 복구 체크포인트와 intended control handoff
4. `.chatgpt-rerun/PLAN.md` — 전체 계획과 acceptance criteria
5. `.chatgpt-rerun/STATUS.md` — 사람용 현황판의 마지막 갱신 내용. reconciliation에는 사용하지 않음
6. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
7. 현재 task 관련 코드, 테스트, 최근 변경사항

## Source-of-truth roles

- `PLAN.md`: 무엇을 완료해야 하는가.
- `STATE.md`: 지금 어디까지 했고, 다음 control에 어떤 상태를 게시해야 하는가.
- `control.json`: 확장프로그램이 다음 실행 여부를 판단하는 최소 신호.
- `STATUS.md`: 사용자가 GitHub에서 현재 상황을 바로 이해하도록 만드는 presentation-only human dashboard.

`STATUS.md`는 source of truth가 아니다. PLAN/STATE/control과 충돌하면 다른 세 파일을 우선하고 STATUS를 다시 생성한다. STATUS를 근거로 sequence/status/task를 추측하거나 reconciliation하지 않는다.

## Human-readable live status

매 실행은 `.chatgpt-rerun/STATUS.md`를 사람이 이해하기 쉬운 형태로 유지한다.

최소 포함 항목:

- 마지막 갱신 시각
- run ID / sequence / control status / current task
- 현재 실제로 무엇을 하는 중인지
- 전체 task/milestone 진행표
- 최근 검증된 사실
- 사용자가 해야 할 일이 있다면 정확한 행동
- 다음 자동 작업
- blocker / risk
- freshness policy

갱신 규칙:

1. task/sequence/status/blocker/검증 결과/현재 행동이 의미 있게 바뀌면 즉시 갱신한다.
2. 실행이 길게 이어지고 마지막 STATUS 갱신 후 약 5분 이상 지났다면 다음 안전한 체크포인트에서 현재 사실로 갱신한다.
3. 18분 time-budget checkpoint와 실행 종료 전 STATUS 내용이 달라졌다면 반드시 갱신한다.
4. 내용이 동일하면 시각만 바꾸기 위한 빈 GitHub 커밋은 만들지 않는다.
5. ChatGPT가 idle/stopped인 동안에는 실제 진행이 없으므로 heartbeat 목적의 빈 커밋을 만들지 않는다.
6. GitHub token, 비밀, 민감한 원문 입력은 STATUS에 기록하지 않는다.

`control.json`은 상태 전환의 마지막 **authoritative** write다. STATUS는 presentation-only이므로 control 게시 후 최신 표시를 위해 갱신할 수 있다. STATUS 쓰기 실패는 run/control 상태를 무효화하지 않는다.

## Preflight reconciliation

프로젝트 작업을 시작하기 전에 `control.json`과 `STATE.md`의 Run ID / Sequence / Desired control status / Current task를 비교한다. STATUS는 이 판단에 사용하지 않는다.

### Normal

STATE와 control의 run/sequence/status/task가 일치하면 현재 sequence를 정상 실행하거나 재개한다.

### Recoverable pending handoff

STATE의 sequence가 control보다 **정확히 1 크고**, PLAN/STATE가 이전 task의 검증 완료와 새 desired status/task를 명확히 기록하고 있다면 이전 실행이 `PLAN → STATE`까지 저장하고 `control.json` 쓰기 전에 끊긴 것이다.

이 경우:

1. 이전 task를 다시 실행하지 않는다.
2. STATE에 기록된 desired status/task/reason으로 `control.json`만 게시한다.
3. `updated_at`은 현재 시각으로 쓴다.
4. 이번 실행에서는 새 task를 시작하지 않고 종료한다.
5. control 게시 후 STATUS가 달라졌다면 presentation-only STATUS를 갱신한다.

확장프로그램이 새 sequence를 보고 다음 실행을 시작하게 한다.

### Unsafe mismatch

다음은 자동 복구하지 않는다.

- run_id 불일치
- control sequence가 STATE보다 앞섬
- STATE가 control보다 2 이상 앞섬
- 같은 sequence인데 status/task가 모순됨

이 경우 일반 작업을 중단하고 불일치 내용을 STATE에 기록한 뒤, 안전하게 기록할 수 있다면 새 sequence의 `needs_user`를 **STATE 먼저, control 마지막 authoritative write** 순서로 게시한다. 추측으로 코드 작업을 계속하지 않는다. 그 뒤 STATUS를 사람에게 이해 가능한 경고 상태로 갱신할 수 있다.

## Hard execution time budget

**한 번의 ChatGPT 실행은 시작부터 종료까지 반드시 20분을 넘기지 않는다.** 이 제한은 sequence 전체가 아니라 개별 실행(turn)에 적용된다. 같은 sequence는 여러 실행에 걸쳐 재개할 수 있다.

1. 실행 시작 시 `STATE.md`에 현재 실행의 시작 시각과 20분 hard deadline을 기록한다.
2. 약 18분이 되면 새 장기 작업, 긴 검증, 대규모 탐색을 시작하지 않는다.
3. 18분 이후에는 `STATE.md` 체크포인트 갱신을 우선한다. 완료 내용, 실제 검증 결과, 미완료 항목, `Next Exact Action`을 다음 실행이 바로 이어받을 수 있게 적는다.
4. 현재 task가 아직 verified가 아니면 current `continue` + 같은 sequence를 유지한다. 시간 때문에 억지로 verified/complete 처리하지 않는다.
5. 18분 checkpoint 또는 종료 전 STATUS 내용이 달라졌다면 사람용 현황판도 갱신한다.
6. **20분 deadline 전에 응답을 종료한다.** 확장프로그램이 same-sequence retry를 통해 다음 실행을 만든다.
7. deadline 직전에 오래 걸릴 수 있는 단일 명령/도구 호출을 시작하지 않는다. 불명확한 작업은 더 작은 단위로 나눈다.
8. 시간 제한으로 중단한 경우 STATE의 Phase를 `time_budget_checkpoint`로 기록할 수 있으며, 이는 실패가 아니라 정상적인 재개 체크포인트다.

## Execution rules

1. preflight reconciliation을 완료한다.
2. 현재 `run_id`, `sequence`, `task_id`를 확정한다.
3. 이번 실행의 시작 시각과 20분 hard deadline을 STATE에 기록한다.
4. `STATE.md`에서 미완료 체크포인트를 찾는다.
5. 이미 `verified`된 작업은 근거 없이 반복하지 않는다.
6. 구현 후 PLAN에 정의된 검증을 실제로 수행한다.
7. 긴 작업이면 의미 있는 체크포인트마다 `STATE.md`를 갱신한다.
8. authoritative 다음 상태를 게시할 때는 **PLAN → STATE → control.json 순서**로 갱신한다.
9. `control.json`은 authoritative 상태 전환에서 반드시 마지막에 갱신한다.
10. STATUS가 달라졌다면 presentation-only STATUS를 갱신한다. control 이후에 써도 된다.
11. 20분 hard deadline 전에 이번 실행을 종료한다.

## Do not set `working`

현재 task를 시작했다는 이유로 control 상태를 변경하지 않는다. 작업 중에는 현재 `continue` + 같은 `sequence`를 유지한다. 그래야 응답이 중간에 종료되거나 20분 시간 예산에 도달해도 확장프로그램이 같은 sequence를 다시 실행할 수 있다.

## Control transitions

현재 task가 검증을 통과하고 다음 task가 있으면:

- PLAN의 현재 task를 `verified`로 표시한다.
- STATE의 Sequence를 1 증가시키고 Desired control status를 `continue`, Current task를 다음 task, Control reason을 전환 이유로 기록한다.
- STATE의 나머지 복구 정보를 다음 task 기준으로 갱신한다.
- 마지막 authoritative write로 control의 `sequence`, `status`, `task_id`, `reason`을 STATE와 일치시키고 `updated_at`을 현재 시각으로 갱신한다.
- 이후 STATUS를 새 사람용 상태로 갱신한다.

전체 계획과 검증이 끝났으면 PLAN을 완료 상태로 만든 뒤 STATE의 다음 sequence / Desired control status를 `complete`로 기록하고, 마지막 authoritative write로 control을 일치시킨다. 이후 STATUS를 완료 상태로 갱신한다.

사용자 선택이 필요하면 STATE에 질문/선택지를 기록하고 다음 sequence / Desired control status를 `needs_user`로 만든 뒤, 마지막 authoritative write로 control을 일치시킨다. 이후 STATUS의 `지금 사용자가 해야 할 것`을 구체적으로 갱신한다.

자동으로 안전하게 해결할 수 없는 blocker가 있으면 STATE에 원인/시도/남은 blocker를 기록하고 다음 sequence / Desired control status를 `blocked`로 만든 뒤, 마지막 authoritative write로 control을 일치시킨다. 이후 STATUS를 blocker 요약으로 갱신한다.

## Sequence invariants

- 같은 작업 중에는 sequence를 유지한다.
- 새 task 또는 terminal 상태로 전환할 때만 sequence를 증가시킨다.
- sequence를 감소시키지 않는다.
- 동일 자동화 흐름에서는 `run_id`를 바꾸지 않는다.
- 20분 실행 제한으로 체크포인트 후 종료할 때는 task가 미완료라면 sequence를 증가시키지 않는다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. 테스트, lint, build, typecheck 등 실제 결과를 STATE에 기록한다. acceptance criteria가 충족되지 않으면 `complete`를 게시하지 않는다. STATUS에는 검증 결과를 사용자가 이해할 수 있는 말로 요약하되 STATE보다 강한 주장을 만들지 않는다.

## Recovery requirement

`STATE.md`는 다음 실행이 이전 응답의 내용을 추측하지 않고도 바로 이어갈 수 있을 만큼 구체적이어야 한다. 최소한 run/sequence, desired control status, 현재 task, phase, 현재 실행 시작/마감 시각, 완료된 일, 검증 결과, 미완료 항목, 다음 정확한 행동을 유지한다.

`STATUS.md`는 복구용이 아니라 관찰용이다. 없어지거나 stale해도 STATE/control로 정상 복구할 수 있어야 한다.
