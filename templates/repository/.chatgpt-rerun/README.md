# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md` — 이 계약
2. `.chatgpt-rerun/control.json` — 현재 run/sequence와 실행 상태
3. `.chatgpt-rerun/STATE.md` — 마지막 복구 체크포인트
4. `.chatgpt-rerun/PLAN.md` — 전체 계획과 acceptance criteria
5. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
6. 현재 task 관련 코드, 테스트, 최근 변경사항

## Source-of-truth roles

- `PLAN.md`: 무엇을 완료해야 하는가.
- `STATE.md`: 지금 어디까지 했고 정확히 무엇을 이어서 해야 하는가.
- `control.json`: 확장프로그램이 다음 실행 여부를 판단하는 최소 신호.

`control.json`에 상세 진행 로그를 넣지 않는다.

## Execution rules

1. 현재 `run_id`, `sequence`, `task_id`를 확인한다.
2. `STATE.md`에서 미완료 체크포인트를 찾는다.
3. 이미 `verified`된 작업은 근거 없이 반복하지 않는다.
4. 구현 후 PLAN에 정의된 검증을 실제로 수행한다.
5. 긴 작업이면 의미 있는 체크포인트마다 `STATE.md`를 갱신한다.
6. 다음 상태를 게시할 때는 **PLAN → STATE → control.json 순서**로 갱신한다.
7. `control.json`은 반드시 마지막에 갱신한다.

## Do not set `working`

현재 task를 시작했다는 이유로 control 상태를 변경하지 않는다. 작업 중에는 현재 `continue` + 같은 `sequence`를 유지한다. 그래야 응답이 중간에 종료되어도 확장프로그램이 같은 sequence를 다시 실행할 수 있다.

## Control transitions

현재 task가 검증을 통과하고 다음 task가 있으면:

- PLAN의 현재 task를 `verified`로 표시한다.
- STATE에 결과와 다음 정확한 행동을 기록한다.
- `sequence`를 1 증가시킨다.
- `status`를 `continue`로 유지한다.
- `task_id`를 다음 task로 변경한다.
- `updated_at`을 현재 ISO-8601 시각으로 갱신한다.

전체 계획과 검증이 끝났으면 PLAN/STATE를 먼저 완료 상태로 만든 뒤 sequence를 증가시키고 `complete`를 게시한다.

사용자 선택이 필요하면 STATE에 질문/선택지를 기록한 뒤 sequence를 증가시키고 `needs_user`를 게시한다.

자동으로 안전하게 해결할 수 없는 blocker가 있으면 STATE에 원인/시도/남은 blocker를 기록한 뒤 sequence를 증가시키고 `blocked`를 게시한다.

## Sequence invariants

- 같은 작업 중에는 sequence를 유지한다.
- 새 task 또는 terminal 상태로 전환할 때만 sequence를 증가시킨다.
- sequence를 감소시키지 않는다.
- 동일 자동화 흐름에서는 `run_id`를 바꾸지 않는다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. 테스트, lint, build, typecheck 등 실제 결과를 STATE에 기록한다. acceptance criteria가 충족되지 않으면 `complete`를 게시하지 않는다.

## Recovery requirement

`STATE.md`는 다음 실행이 이전 응답의 내용을 추측하지 않고도 바로 이어갈 수 있을 만큼 구체적이어야 한다. 최소한 현재 task, phase, 완료된 일, 검증 결과, 미완료 항목, 다음 정확한 행동을 유지한다.
