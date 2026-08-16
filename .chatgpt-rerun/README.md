# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. `docs/E2E_TEST_PLAN.md`
6. `docs/E2E_RESULT.md`
7. 저장소 고유 지침과 현재 task 관련 코드/테스트/최근 변경사항

## Preflight reconciliation

작업 전 `control.json`과 `STATE.md`의 Run ID / Sequence / Desired control status / Current task를 비교한다.

- Normal: 모두 일치하면 현재 sequence를 실행/재개한다.
- Recoverable pending handoff: STATE.Sequence가 control.sequence보다 정확히 1 크고 이전 task 검증 완료 및 새 intended status/task가 명확하면 이전 task를 반복하지 않고 control handoff만 게시한 뒤 이번 실행을 종료한다.
- Unsafe mismatch: run_id 불일치, control이 STATE보다 앞섬, STATE가 2 이상 앞섬, 같은 sequence에서 status/task 모순은 작업을 추측으로 진행하지 말고 `needs_user`로 안전 정지한다.

## Dogfood execution rules

이 저장소의 현재 run은 `docs/E2E_TEST_PLAN.md`에 정의된 E2E-001~004를 자동으로 검증한다.

1. 현재 task의 probe rule을 반드시 읽는다.
2. `docs/E2E_RESULT.md`에 실제 관찰 evidence를 남긴다.
3. 이미 verified된 E2E task를 반복하지 않는다.
4. 구현/검증보다 probe가 요구하는 상태 전환 자체가 우선이다.
5. 다음 상태 게시 순서는 항상 **PLAN -> STATE -> control.json**이다.
6. `control.json`은 마지막에 쓴다.
7. 작업 중에는 current `continue` sequence를 유지한다. `working`을 사용하지 않는다.

## Intentional stop semantics

E2E-002 첫 실행과 E2E-003 첫 실행은 테스트를 위해 의도적으로 control을 다음 상태로 게시하지 않고 응답을 끝낸다.

- E2E-002: STATE phase만 `awaiting_same_sequence_retry`로 체크포인트하고 같은 control sequence를 유지한다.
- E2E-003: PLAN/STATE는 다음 sequence로 handoff하되 control은 이전 sequence로 유지한다.

이 두 경우는 실패가 아니다. runbook의 probe다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. E2E PASS는 `docs/E2E_RESULT.md`의 실제 evidence가 있어야 한다.

## Completion

E2E-004가 끝나기 전 `complete`를 게시하지 않는다. E2E-004 완료 시 PLAN/STATE를 먼저 완료 상태로 만들고 마지막에 control을 `sequence: 4`, `status: "complete"`로 게시한다.
