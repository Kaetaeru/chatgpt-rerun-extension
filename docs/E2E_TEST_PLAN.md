# ChatGPT Rerun E2E Test Plan

이 문서는 `agent/mvp-autoresume` 브랜치의 확장프로그램을 실제 Chrome + ChatGPT + GitHub 흐름으로 검증하는 dogfood E2E runbook이다.

## Scope

이 저장소 자체를 자동화 대상으로 사용한다. 별도 테스트 저장소는 만들지 않는다.

검증 대상:

1. 새 `continue` sequence가 ChatGPT 재개 프롬프트를 정확히 한 번 전송하는가.
2. 다음 sequence가 GitHub에 게시되면 다음 실행이 자동으로 시작되는가.
3. 같은 `continue` sequence가 유지된 채 응답이 끝나면 retry delay 후 같은 sequence가 다시 실행되는가.
4. `PLAN -> STATE` 저장 후 `control.json` 게시 전에 중단된 상태를 reconciliation이 복구하는가.
5. `complete`가 게시되면 확장프로그램 세션이 중지되는가.
6. 검증된 작업을 중복 수행하지 않는가.

## Current test target

- Repository: `Kaetaeru/chatgpt-rerun-extension`
- Extension source branch: `agent/mvp-autoresume`
- Automation branch: `agent/mvp-autoresume`
- Control path: `.chatgpt-rerun/control.json`
- Run ID: `chatgpt-rerun-dogfood-20260816-02`
- Initial sequence: `0`
- Initial task: `E2E-001`

Run `...-01`은 Start가 동작하지 않고 popup 입력값이 사라지는 문제를 발견한 실패 시도다. 근거는 `docs/E2E_RESULT.md`에 보존한다.

## Preconditions

1. 로컬 저장소를 `agent/mvp-autoresume` 최신 상태로 갱신한다.
2. `chrome://extensions`에서 이 unpacked extension의 **Reload** 버튼을 누른다.
3. 확장 아이콘을 클릭했을 때 작은 popup이 아니라 Chrome **Side Panel**이 열리는지 확인한다.
4. 자동화에 사용할 ChatGPT 대화를 연다.
5. `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `control.json`이 모두 존재하는지 확인한다.

기존에 열려 있던 ChatGPT 탭은 새로고침이 필수가 아니다. Start가 content script를 ping하고 없으면 런타임 주입해야 한다. 이 동작 자체도 E2E-001의 일부다.

## Recommended extension settings

### Public/no-token profile

- Owner: `Kaetaeru`
- Repository: `chatgpt-rerun-extension`
- Branch: `agent/mvp-autoresume`
- Control file: `.chatgpt-rerun/control.json`
- Poll seconds: `60`
- Retry after seconds: `120`
- Retries / sequence: `2`
- Max sends: `10`
- GitHub token: empty

### Fast profile

repository contents read 권한으로 제한된 GitHub token을 사용할 때만:

- Poll seconds: `5`
- Retry after seconds: `10`
- Retries / sequence: `2`
- Max sends: `10`

## Side Panel persistence probe

자동 실행 전에 반드시 확인한다.

1. Side Panel의 Owner에 `Kaetaeru`를 입력한다.
2. Repository에 일부 값을 입력한다.
3. ChatGPT 페이지 본문을 클릭하고 다시 Side Panel을 확인한다.
4. Side Panel이 닫히지 않아야 한다.
5. Side Panel을 사용자가 직접 닫았다가 다시 연다.
6. 방금 입력한 값이 복원되어야 한다.
7. 이 과정은 Save 버튼을 누르기 전에도 동작해야 한다.

실패하면 E2E-001을 시작하지 않고 결과를 기록한다.

## Start procedure

1. 확장 아이콘을 눌러 Side Panel을 연다.
2. 설정을 입력한다. 입력값은 즉시 draft 저장되어야 한다.
3. 자동화할 **ChatGPT 탭을 활성 탭으로 만든다**.
4. Side Panel에서 **Start on active ChatGPT tab**을 누른다.
5. `control.json`은 seq 0 / `continue` / `E2E-001`이어야 한다.
6. Start 직후 content script가 ping 또는 주입되고 wake되어 재개 프롬프트가 전송되어야 한다.
7. 이후 E2E-004가 끝날 때까지 사용자가 `진행`을 직접 입력하지 않는다.

## Expected automated sequence

| Stage | control.json | STATE.md | Expected behavior |
|---|---|---|---|
| Initial | seq 0 / continue / E2E-001 | seq 0 / E2E-001 | Start 후 재개 프롬프트 자동 전송 |
| E2E-001 complete | seq 1 / continue / E2E-002 | seq 1 / E2E-002 | 새 sequence 감지 후 E2E-002 자동 실행 |
| E2E-002 first pass | **seq 1 유지** | seq 1 / `awaiting_same_sequence_retry` | 응답 종료 후 retry 대기 |
| E2E-002 retry | seq 2 / continue / E2E-003 | seq 2 / E2E-003 | 같은 seq 1 자동 재실행 후 체크포인트 재개 |
| E2E-003 first pass | **seq 2 유지** | **seq 3 / E2E-004** | STATE만 다음 handoff로 저장 |
| Reconciliation pass | seq 3 / continue / E2E-004 | seq 3 / E2E-004 | 이전 task 반복 없이 control handoff만 복구 |
| E2E-004 | seq 4 / complete | seq 4 / complete | evidence 마감 후 자동 중지 |

## E2E-001 — initial and next-sequence dispatch

- 자동 재개 프롬프트로 진입했음을 `docs/E2E_RESULT.md`에 기록한다.
- control/STATE/PLAN 일치를 확인한다.
- 가능하면 `npm run check`와 `npm test`를 실행하고 실제 결과를 기록한다.
- E2E-001을 verified 처리한다.
- STATE와 control을 seq 1 / `continue` / `E2E-002`로 전환한다.
- control은 항상 마지막에 쓴다.

PASS: 사용자의 추가 입력 없이 E2E-002가 시작된다.

## E2E-002 — same-sequence retry

첫 실행에서 phase가 `not_started`라면:

1. E2E_RESULT에 first pass를 기록한다.
2. STATE sequence는 1로 유지한다.
3. phase를 `awaiting_same_sequence_retry`로 바꾼다.
4. `Next Exact Action`을 기록한다.
5. PLAN task 상태와 control을 변경하지 않는다.
6. 의도적으로 응답을 종료한다.

재실행에서 phase가 `awaiting_same_sequence_retry`라면:

1. 같은 sequence 자동 재실행 evidence를 기록한다.
2. E2E-002를 verified 처리한다.
3. STATE/control을 seq 2 / `continue` / `E2E-003`으로 전환한다.

PASS: 사용자 입력 없이 같은 seq 1이 두 번째로 실행된다.

## E2E-003 — STATE/control handoff recovery

첫 실행:

1. E2E-003 evidence를 기록한다.
2. PLAN에서 E2E-003을 verified 처리한다.
3. STATE를 seq 3 / desired `continue` / E2E-004로 갱신한다.
4. **control은 seq 2 상태 그대로 둔다.**
5. 의도적으로 응답을 종료한다.

다음 자동 재실행:

- preflight에서 STATE 3 / control 2를 감지한다.
- E2E-003을 다시 수행하지 않는다.
- STATE의 intended handoff만 control seq 3에 게시한다.
- 그 실행에서는 E2E-004를 시작하지 않고 종료한다.

PASS: 그 다음 새 seq 3 자동 실행에서 E2E-004가 시작된다.

## E2E-004 — terminal complete

- 이전 task가 모두 verified인지 확인한다.
- E2E_RESULT 최종 결과를 갱신한다.
- E2E-004를 verified 처리한다.
- PLAN Definition of Done을 완료한다.
- STATE를 seq 4 / desired `complete`로 전환한다.
- 마지막으로 control을 seq 4 / `complete`로 게시한다.

PASS: Side Panel에 `Stopped · complete`가 표시되고 추가 프롬프트가 없다.

## Pass criteria

- E2E-001~004 모두 verified.
- E2E_RESULT에 실제 evidence 존재.
- Side Panel focus/persistence probe PASS.
- 이미 열린 ChatGPT 탭에서 Start bootstrap PASS.
- same-sequence retry 실제 발생.
- pending handoff가 task 반복 없이 복구.
- 최종 control seq 4 / complete.
- 수동 `진행` 입력 0회.

## Failure handling

어느 단계에서든 예상과 다르면 다음 task로 넘어가지 않는다.

1. E2E_RESULT에 FAIL과 관찰값을 기록한다.
2. STATE에 실제 control/sequence/task, Side Panel stop reason/error, 다음 조사 행동을 기록한다.
3. 실패 원인을 수정한다.
4. 새 `run_id`로 sequence 0부터 다시 시작한다.

## Additional manual safety checks

주 E2E PASS 뒤 별도 run_id로 확인한다.

- 사용자 draft -> `composer_not_empty`
- `needs_user` terminal stop
- `blocked` terminal stop
- sequence regression -> `sequence_regressed`
- max sends -> idle 후 `max_runs`
- retry limit -> idle 후 `retry_limit`
