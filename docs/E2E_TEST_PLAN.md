# ChatGPT Rerun E2E Test Plan

이 문서는 `agent/mvp-autoresume` 브랜치의 확장프로그램을 실제 Chrome + ChatGPT + GitHub 흐름으로 검증하는 수동/반자동 E2E runbook이다.

## Scope

이 E2E는 `Kaetaeru/chatgpt-rerun-extension` 저장소 자체를 자동화 대상으로 사용하는 dogfood 테스트다. 별도 테스트 저장소가 필요 없다.

검증 대상:

1. 새 `continue` sequence가 ChatGPT 재개 프롬프트를 정확히 한 번 전송하는가.
2. ChatGPT가 다음 sequence를 GitHub에 게시하면 다음 실행이 자동으로 시작되는가.
3. 같은 `continue` sequence가 유지된 채 응답이 끝나면 retry delay 후 같은 sequence가 다시 실행되는가.
4. `PLAN -> STATE` 저장 후 `control.json` 게시 전에 중단된 상태를 preflight reconciliation이 복구하는가.
5. `complete`가 게시되면 확장프로그램 세션이 중지되는가.
6. 자동화 과정에서 검증된 작업을 중복 수행하지 않는가.

## Test target

- Repository: `Kaetaeru/chatgpt-rerun-extension`
- Extension source branch: `agent/mvp-autoresume`
- Automation branch: `agent/mvp-autoresume`
- Control path: `.chatgpt-rerun/control.json`
- Run ID: `chatgpt-rerun-dogfood-20260816-01`
- Initial sequence: `0`
- Initial task: `E2E-001`

## Preconditions

- Chrome에서 이 저장소의 `agent/mvp-autoresume` 브랜치를 로컬로 받은 상태여야 한다.
- `chrome://extensions`에서 Developer mode를 켠다.
- **Load unpacked**로 확장프로그램 디렉터리를 로드한다.
- 자동화에 사용할 ChatGPT 대화가 GitHub 저장소를 읽고 쓸 수 있어야 한다.
- 테스트 시작 전에 `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `control.json`이 모두 존재하는지 확인한다.

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

이 프로필은 별도 토큰이 필요 없지만 sequence 갱신 확인과 retry에 시간이 걸린다.

### Fast local profile

테스트를 빠르게 돌리고 싶을 때만 repository contents read 권한으로 제한된 GitHub token을 사용한다.

- Poll seconds: `5`
- Retry after seconds: `10`
- Retries / sequence: `2`
- Max sends: `10`

토큰은 확장프로그램의 `chrome.storage.local`에 저장되므로 공유 PC에서는 사용하지 않는다.

## Start procedure

1. 자동화에 사용할 ChatGPT 대화를 연다.
2. 확장프로그램 popup을 연다.
3. 위 설정을 입력하고 **Save**한다.
4. `control.json`이 `sequence: 0`, `status: "continue"`, `task_id: "E2E-001"`인지 확인한다.
5. 같은 ChatGPT 탭에서 **Start on this tab**을 누른다.
6. 이후 사용자가 `진행`을 직접 입력하지 않는다. E2E-004가 끝날 때까지 확장프로그램이 연속 실행을 담당한다.

## Expected automated sequence

| Stage | control.json | STATE.md | Expected behavior |
|---|---|---|---|
| Initial | seq 0 / continue / E2E-001 | seq 0 / E2E-001 | Start 후 재개 프롬프트 자동 전송 |
| E2E-001 complete | seq 1 / continue / E2E-002 | seq 1 / E2E-002 | 새 sequence 감지 후 E2E-002 자동 실행 |
| E2E-002 first pass | **seq 1 유지** | seq 1 / phase `awaiting_same_sequence_retry` | 응답이 끝나도 control을 바꾸지 않음 |
| E2E-002 retry | seq 2 / continue / E2E-003 | seq 2 / E2E-003 | retry delay 후 같은 seq 1이 자동 재실행되고 체크포인트에서 재개 |
| E2E-003 first pass | **seq 2 유지** | **seq 3 / E2E-004** | STATE만 다음 handoff로 저장하고 control은 의도적으로 이전 상태 유지 |
| Reconciliation pass | seq 3 / continue / E2E-004 | seq 3 / E2E-004 | 이전 E2E-003을 반복하지 않고 control handoff만 복구 후 종료 |
| E2E-004 | seq 4 / complete | seq 4 / complete | 최종 evidence 갱신 후 확장프로그램 자동 중지 |

## Task-specific probe rules

### E2E-001 — initial and next-sequence dispatch

- 자동 재개 프롬프트로 진입했음을 `docs/E2E_RESULT.md`에 기록한다.
- 현재 control/STATE/PLAN이 정상적으로 일치하는지 확인한다.
- `E2E-001`을 verified 처리한다.
- STATE와 control을 sequence 1 / `continue` / `E2E-002`로 전환한다.
- control은 항상 마지막에 쓴다.

PASS: 사용자의 추가 입력 없이 E2E-002 실행이 시작된다.

### E2E-002 — same-sequence retry

첫 실행과 재실행을 STATE phase로 구분한다.

첫 실행에서 phase가 `not_started`라면:

1. `docs/E2E_RESULT.md`에 E2E-002 first pass를 기록한다.
2. STATE의 sequence는 1로 유지한다.
3. STATE phase를 `awaiting_same_sequence_retry`로 바꾼다.
4. `Next Exact Action`에 재실행 시 수행할 일을 기록한다.
5. PLAN task 상태와 control.json을 변경하지 않는다.
6. **의도적으로 응답을 종료한다.**

재실행에서 phase가 `awaiting_same_sequence_retry`라면:

1. 같은 sequence가 자동으로 다시 실행되었다는 evidence를 기록한다.
2. E2E-002를 verified 처리한다.
3. STATE/control을 sequence 2 / `continue` / `E2E-003`으로 전환한다.

PASS: 사용자의 입력 없이 같은 sequence 1이 두 번째로 실행된다.

### E2E-003 — STATE/control handoff crash recovery

첫 실행에서는 crash window를 의도적으로 만든다.

1. E2E-003의 검증/evidence를 기록한다.
2. PLAN에서 E2E-003을 verified 처리한다.
3. STATE를 sequence 3 / desired `continue` / current task `E2E-004`로 갱신한다.
4. STATE에 E2E-003 검증 완료와 intended handoff를 명확히 남긴다.
5. **control.json은 sequence 2 상태 그대로 둔다.**
6. **의도적으로 응답을 종료한다.**

다음 자동 재실행에서 preflight가 STATE seq 3 / control seq 2를 발견해야 한다.

- E2E-003을 다시 구현/검증하지 않는다.
- STATE의 intended handoff만 control.json에 sequence 3으로 게시한다.
- 그 실행에서는 E2E-004를 시작하지 않고 종료한다.

PASS: 이후 새 sequence 3을 감지한 별도 자동 실행에서 E2E-004가 시작된다.

### E2E-004 — terminal complete

- 이전 task들이 모두 verified인지 확인한다.
- `docs/E2E_RESULT.md` 최종 결과를 갱신한다.
- E2E-004를 verified 처리한다.
- PLAN의 Definition of Done을 완료 표시한다.
- STATE를 sequence 4 / desired `complete`로 전환한다.
- 마지막으로 control.json에 sequence 4 / `complete`를 게시한다.

PASS: popup이 `Stopped · complete` 상태가 되고 추가 프롬프트가 전송되지 않는다.

## Pass criteria

전체 E2E PASS는 아래가 모두 참일 때만 선언한다.

- E2E-001~004가 모두 `verified`다.
- `docs/E2E_RESULT.md`에 각 단계의 실제 evidence가 기록되어 있다.
- E2E-002에서 같은 sequence 자동 retry가 실제 발생했다.
- E2E-003에서 STATE/control pending handoff가 task 반복 없이 복구됐다.
- 최종 control은 `sequence: 4`, `status: "complete"`다.
- 확장프로그램은 `complete` 때문에 중지됐다.
- 사용자 수동 `진행` 입력은 0회다.

## Failure handling

어느 단계에서든 예상 흐름과 다르면 다음 작업으로 넘어가지 않는다.

1. `docs/E2E_RESULT.md`에 FAIL과 관찰 결과를 기록한다.
2. STATE에 실제 control/sequence/task, popup의 stop reason/error, 다음 조사 행동을 기록한다.
3. 안전하게 기록할 수 있으면 새 sequence의 `blocked`를 STATE 먼저, control 마지막 순서로 게시한다.
4. 실패 원인을 수정한 뒤 새 `run_id`로 E2E를 처음부터 다시 시작한다.

## Additional manual safety checks

주 E2E가 PASS한 뒤 별도 run_id로 다음 항목을 수동 확인한다.

- ChatGPT 입력창에 사용자 draft가 있을 때 `composer_not_empty`로 중지되는가.
- `needs_user` 게시 시 즉시 중지되는가.
- `blocked` 게시 시 즉시 중지되는가.
- sequence를 의도적으로 감소시키면 `sequence_regressed`로 중지되는가.
- max sends 도달 시 현재 생성이 끝난 뒤 `max_runs`로 중지되는가.
- retries/sequence 한도 도달 시 현재 생성이 끝난 뒤 `retry_limit`으로 중지되는가.

이 항목들은 자동 dogfood run과 분리한다. 주 E2E의 deterministic한 흐름을 깨지 않기 위해서다.
