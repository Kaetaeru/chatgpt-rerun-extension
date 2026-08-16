# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. `docs/V02_E2E_TEST_PLAN.md`
6. `docs/V02_E2E_RESULT.md`
7. `docs/TAB_SESSIONS_AND_HANDOFF.md`
8. 저장소 고유 지침과 현재 task 관련 코드/테스트/최근 변경사항

현재 active dogfood run은 v0.2다. 과거 `docs/E2E_TEST_PLAN.md` / `docs/E2E_RESULT.md`는 v0.1 역사적 evidence이며, v0.2 PASS 판정의 현재 runbook으로 사용하지 않는다.

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
6. deadline을 넘길 가능성이 큰 단일 명령/도구 호출은 직전에 시작하지 않는다. 예상 시간이 불명확하면 더 작은 단위로 분할한다.
7. 시간 제한으로 종료하는 것은 실패가 아니다. STATE에 `time_budget_checkpoint`로 기록하고 같은 sequence에서 안전하게 재개한다.

## v0.2 dogfood execution rules

현재 run은 `docs/V02_E2E_TEST_PLAN.md`의 V02-001~006을 검증한다.

1. 현재 task의 probe rule을 반드시 읽는다.
2. `docs/V02_E2E_RESULT.md`에 **실제로 관찰한 evidence만** 남긴다.
3. 이미 verified된 task는 반복하지 않는다.
4. 구현/검증보다 현재 probe가 요구하는 상태 전환과 브라우저 관찰을 우선한다.
5. 다음 상태 게시 순서는 항상 **PLAN -> STATE -> control.json**이다.
6. `control.json`은 상태 전환에서 반드시 마지막에 쓴다.
7. 작업 중에는 current `continue` sequence를 유지한다. `working`을 사용하지 않는다.
8. 한 탭의 runtime evidence를 다른 탭의 evidence로 추정하지 않는다.
9. 같은 GitHub control stream은 두 탭이 동시에 소유하지 않는다.
10. 새 채팅 handoff는 이전 대화 본문이 아니라 GitHub README/control/STATE/PLAN을 기준으로 복구한다.
11. assistant output을 파싱해 token/context-limit 문구를 감지하지 않는다.

## Per-tab and new-chat invariants

- 설정, runtime, draft는 Chrome tab ID별로 독립적이어야 한다.
- Start/Stop은 해당 탭 세션에만 적용되어야 한다.
- 동일 owner/repo/branch/control path를 이미 실행 중인 다른 탭이 있으면 두 번째 Start는 거부한다.
- `Continue in new chat` handoff 중 기존 탭은 `handoffPending`으로 normal polling을 멈춘다.
- handoff 성공 시 새 탭이 같은 GitHub run/sequence의 소유권을 이어받고 기존 탭은 중지한다.
- 대화가 바뀌었다는 이유만으로 GitHub sequence를 증가시키지 않는다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. browser E2E는 실제 탭 ID, 패널 상태, 자동 prompt 도착, 오류 메시지 등 관찰 가능한 evidence가 있어야 한다.

## Completion

`PLAN.md`의 현재 Definition of Done과 V02-001~006의 실행 가능한 acceptance criteria가 충족되기 전 `complete`를 게시하지 않는다. 완료 시 PLAN을 먼저 완료 상태로 만들고 STATE를 다음 sequence / `complete`로 갱신한 뒤 control을 마지막에 일치시킨다. 고정된 terminal sequence 번호를 가정하지 않는다.
