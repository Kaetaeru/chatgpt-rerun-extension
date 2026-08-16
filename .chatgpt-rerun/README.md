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

## Hard execution time budget

**한 번의 ChatGPT 실행은 시작부터 종료까지 반드시 20분을 넘기지 않는다.** 이 제한은 sequence 전체가 아니라 개별 실행(turn)에 적용된다. 같은 sequence는 여러 실행에 걸쳐 재개할 수 있다.

1. 실행을 시작하면 현재 시각을 기준으로 20분 hard deadline을 계산한다.
2. 약 18분이 되면 새 장기 작업, 긴 검증, 대규모 탐색을 시작하지 않는다.
3. 18분 이후에는 현재 결과를 안전한 체크포인트로 정리하고 `STATE.md`의 완료 내용, 검증 결과, 미완료 항목, `Next Exact Action`을 우선 갱신한다.
4. 현재 task가 20분 안에 검증 완료되지 않으면 `control.json`의 현재 `continue` + 같은 sequence를 유지한다. 완료되지 않은 task를 억지로 verified 처리하거나 다음 sequence로 넘기지 않는다.
5. **20분 deadline 전에 응답을 종료한다.** 확장프로그램의 same-sequence retry가 다음 실행을 만들고, 다음 실행은 STATE 체크포인트에서 이어간다.
6. 20분 제한에 걸릴 가능성이 큰 단일 명령/도구 호출은 deadline 직전에 시작하지 않는다. 예상 실행 시간이 불명확하면 더 작은 단위로 분할한다.
7. 시간 제한으로 종료하는 것은 실패가 아니다. STATE에 `time_budget_checkpoint`로 기록하고 같은 sequence에서 안전하게 재개한다.

## Dogfood execution rules

이 저장소의 현재 run은 `docs/E2E_TEST_PLAN.md`에 정의된 E2E-001~004를 자동으로 검증한다.

1. 현재 task의 probe rule을 반드시 읽는다.
2. `docs/E2E_RESULT.md`에 실제 관찰 evidence를 남긴다.
3. 이미 verified된 E2E task를 반복하지 않는다.
4. 구현/검증보다 probe가 요구하는 상태 전환 자체가 우선이다.
5. 다음 상태 게시 순서는 항상 **PLAN -> STATE -> control.json**이다.
6. `control.json`은 마지막에 쓴다.
7. 작업 중에는 current `continue` sequence를 유지한다. `working`을 사용하지 않는다.
8. 위 Hard execution time budget은 dogfood 실행에도 동일하게 적용한다.

## Intentional stop semantics

E2E-002 첫 실행과 E2E-003 첫 실행은 테스트를 위해 의도적으로 control을 다음 상태로 게시하지 않고 응답을 끝낸다.

- E2E-002: STATE phase만 `awaiting_same_sequence_retry`로 체크포인트하고 같은 control sequence를 유지한다.
- E2E-003: PLAN/STATE는 다음 sequence로 handoff하되 control은 이전 sequence로 유지한다.

이 두 경우는 실패가 아니다. runbook의 probe다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. E2E PASS는 `docs/E2E_RESULT.md`의 실제 evidence가 있어야 한다.

## Completion

E2E-004가 끝나기 전 `complete`를 게시하지 않는다. E2E-004 완료 시 PLAN/STATE를 먼저 완료 상태로 만들고 마지막에 control을 `sequence: 4`, `status: "complete"`로 게시한다.
