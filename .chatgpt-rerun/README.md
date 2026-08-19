# ChatGPT Rerun Contract

이 디렉터리는 중단 가능한 장기 ChatGPT 작업의 source of truth다. 자동 재실행을 포함한 **매 실행에서 이 문서를 가장 먼저 읽고 그대로 따른다.**

## Mandatory read order

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. `.chatgpt-rerun/STATUS.md` — 사람용 현황판의 마지막 갱신 시각/표시 내용 확인용. reconciliation에는 사용하지 않음.
6. `docs/V02_E2E_TEST_PLAN.md`
7. `docs/V02_E2E_RESULT.md`
8. `docs/TAB_SESSIONS_AND_HANDOFF.md`
9. 저장소 고유 지침과 현재 task 관련 코드/테스트/최근 변경사항

현재 active dogfood run은 v0.2.x다. 과거 `docs/E2E_TEST_PLAN.md` / `docs/E2E_RESULT.md`는 v0.1 역사적 evidence이며, 현재 run의 PASS 판정에 사용하지 않는다.

## Source-of-truth roles

- `PLAN.md`: 무엇을 완료해야 하는가.
- `STATE.md`: 지금 어디까지 했고 다음 authoritative control에 어떤 상태를 게시해야 하는가.
- `control.json`: GitHub 쪽 work state와 sequence/task를 표현하는 최소 machine signal.
- `STATUS.md`: 사용자가 GitHub에서 현황을 즉시 이해하도록 만드는 **presentation-only human dashboard**.

`STATUS.md`는 source of truth가 아니다. STATUS와 PLAN/STATE/control이 충돌하면 PLAN/STATE/control을 우선하고 STATUS를 다시 생성한다. STATUS를 근거로 sequence/status/task를 추측하거나 reconciliation하지 않는다.

## Chrome tab watcher vs GitHub work state

v0.2.4부터 Chrome 탭의 Start/Stop과 GitHub control 상태를 서로 다른 축으로 취급한다.

- Side Panel `Start`: 현재 ChatGPT 탭의 GitHub watcher를 켠다. watcher가 켜져 있는 동안 설정된 polling 주기로 control을 계속 확인한다.
- Side Panel `Stop`: 현재 탭 watcher를 명시적으로 끈다.
- `control.status=continue`: GitHub 쪽 작업 시작/재개 신호다. watcher가 켜져 있고 안전 조건을 만족하면 자동 resume prompt를 보낸다.
- `complete`, `needs_user`, `blocked`: 현재 GitHub 작업의 dispatch 대기 상태다. **이 상태만으로 Chrome watcher를 끄지 않는다.** watcher는 계속 polling한다.
- terminal 상태 뒤 GitHub가 다시 `continue`가 되면, 같은 sequence라도 terminal -> continue 전환을 새로운 실행 허가로 보고 즉시 재개할 수 있어야 한다.
- retry limit, sequence regression 같은 dispatch guard도 watcher 자체를 끄지 않고 계속 관찰한다. 새 run/새 유효 상태가 오면 다시 평가한다.
- **workflow 전체의 lifetime send 횟수에는 상한을 두지 않는다.** `Sent`/`runCount`는 진단용 누적 통계일 뿐 dispatch 또는 fresh-chat handoff를 차단하지 않는다. 동일한 control generation의 반복만 per-sequence retry 안전장치로 제한한다.
- `GitHub 승인 후 자동 계속`이 켜진 탭에서는 ChatGPT의 GitHub action-confirmation 카드가 보이는 동안 content script가 Rerun polling/retry를 잠시 멈춘다. **승인 버튼은 자동 클릭하지 않는다.** 사용자가 직접 승인해서 카드가 사라지면 다음 content tick부터 polling과 continuation을 자동 재개한다.
- **Rerun이 자동 제출한 ChatGPT generation이 활성 상태로 23분 이상 계속되면 content script가 현재 ChatGPT Stop 버튼을 한 번 눌러 fail-safe 종료한다.** 이 watchdog은 watcher가 켜진 Rerun-owned generation에만 적용되며 일반 수동 ChatGPT 응답에는 적용하지 않는다. GitHub action-confirmation 카드에서 사용자의 결정을 기다리는 시간은 23분 active-generation 시간에서 제외한다.
- 사용자 composer draft 보호, prompt 전송 실패, bootstrap/handoff 실패처럼 브라우저 안전을 위해 명시적 중지가 필요한 경우는 예외다.
- 탭이 닫히면 그 tab ID의 watcher/config/runtime은 제거된다. 확장프로그램이 꺼져 있으면 polling도 없다.

따라서 GitHub의 `complete`는 "확장프로그램 Stop"이 아니라 "현재 작업 완료, 다음 GitHub work signal을 기다림"을 뜻한다.

## Human-readable live status

매 실행은 `.chatgpt-rerun/STATUS.md`를 사람이 이해하기 쉬운 말로 유지한다.

STATUS에는 최소한 다음 정보를 유지한다.

- 마지막 갱신 시각
- run ID / sequence / control status / current task
- 현재 실제로 무엇을 하는 중인지
- 전체 task/milestone 진행표
- 최근 검증된 사실
- 사용자가 해야 할 일이 있으면 정확한 행동
- 다음 자동 작업
- blocker / risk
- freshness 설명

갱신 규칙:

1. task/sequence/status/blocker/검증 결과/현재 행동이 의미 있게 바뀌면 즉시 갱신한다.
2. 하나의 실행이 길게 이어지고 STATUS의 마지막 갱신 후 약 5분 이상 지났다면, 다음 안전한 체크포인트에서 현재 사실로 갱신한다.
3. 18분 time-budget checkpoint와 실행 종료 전, STATUS 내용이 달라졌다면 반드시 갱신한다.
4. 내용이 동일하면 시각만 바꾸기 위한 빈 커밋은 만들지 않는다.
5. ChatGPT가 idle/stopped인 동안은 실제 진행이 없으므로 heartbeat 목적의 빈 커밋을 만들지 않는다.
6. 비밀, GitHub token, 민감한 원문 입력은 STATUS에 기록하지 않는다.

`control.json`은 상태 전환의 마지막 **authoritative** write다. STATUS는 presentation-only이므로 control 게시 후 새 상태를 반영해 갱신할 수 있다. STATUS 쓰기가 실패하거나 늦어져도 control/STATE의 유효성은 변하지 않는다.

## Preflight reconciliation

작업 전 `control.json`과 `STATE.md`의 Run ID / Sequence / Desired control status / Current task를 비교한다. `STATUS.md`는 이 판단에 넣지 않는다.

- Normal: 모두 일치하면 현재 sequence를 실행/재개한다.
- Recoverable pending handoff: STATE.Sequence가 control.sequence보다 정확히 1 크고 이전 task 검증 완료 및 새 intended status/task가 명확하면 이전 task를 반복하지 않고 control handoff만 게시한 뒤 이번 실행을 종료한다.
- Unsafe mismatch: run_id 불일치, control이 STATE보다 앞섬, STATE가 2 이상 앞섬, 같은 sequence에서 status/task 모순은 작업을 추측으로 진행하지 말고 `needs_user`로 안전 정지한다.

여기서 `needs_user`로 안전 정지한다는 것은 **GitHub work state를 needs_user로 게시한다는 뜻**이다. Chrome watcher가 켜져 있다면 watcher는 계속 GitHub를 관찰한다.

## Hard execution time budget

**한 번의 ChatGPT 실행은 시작부터 종료까지 반드시 20분을 넘기지 않는다.** 이 제한은 sequence 전체가 아니라 개별 실행(turn)에 적용된다. 같은 sequence는 여러 실행에 걸쳐 재개할 수 있다.

1. 실행을 시작하면 현재 시각을 기준으로 20분 hard deadline을 계산한다.
2. 약 18분이 되면 새 장기 작업, 긴 검증, 대규모 탐색을 시작하지 않는다.
3. 18분 이후에는 현재 결과를 안전한 체크포인트로 정리하고 `STATE.md`의 완료 내용, 검증 결과, 미완료 항목, `Next Exact Action`을 우선 갱신한다.
4. 현재 task가 20분 안에 검증 완료되지 않으면 `control.json`의 현재 `continue` + 같은 sequence를 유지한다. 완료되지 않은 task를 억지로 verified 처리하거나 다음 sequence로 넘기지 않는다.
5. 18분 체크포인트 또는 종료 전 STATUS 내용이 바뀌었다면 사람용 현황판도 갱신한다.
6. **20분 deadline 전에 응답을 종료한다.** 확장프로그램의 same-sequence retry가 다음 실행을 만들고, 다음 실행은 STATE 체크포인트에서 이어간다.
7. deadline을 넘길 가능성이 큰 단일 명령/도구 호출은 직전에 시작하지 않는다. 예상 시간이 불명확하면 더 작은 단위로 분할한다.
8. 시간 제한으로 종료하는 것은 실패가 아니다. STATE에 `time_budget_checkpoint`로 기록하고 같은 sequence에서 안전하게 재개한다.
9. **23분 generation watchdog은 20분 규칙을 대체하지 않는 브라우저 fail-safe다.** assistant가 오류/프리즈로 20분 규칙을 지키지 못하고 Rerun-owned generation의 Stop 버튼이 계속 활성 상태로 남아 있을 때만, 3분 grace 뒤 강제로 Stop을 눌러 다음 Rerun continuation이 회복할 수 있게 한다. GitHub 승인 대기 시간은 이 23분 계산에서 제외한다.

## v0.2 dogfood execution rules

현재 run은 `docs/V02_E2E_TEST_PLAN.md`의 검증 항목을 수행한다.

1. 현재 task의 probe rule을 반드시 읽는다.
2. `docs/V02_E2E_RESULT.md`에 **실제로 관찰한 evidence만** 남긴다.
3. 이미 verified된 task는 반복하지 않는다.
4. 구현/검증보다 현재 probe가 요구하는 상태 전환과 브라우저 관찰을 우선한다.
5. authoritative 상태 게시 순서는 항상 **PLAN -> STATE -> control.json**이다.
6. `control.json`은 authoritative 상태 전환에서 반드시 마지막에 쓴다.
7. control 게시 후 STATUS가 달라졌다면 presentation-only STATUS를 갱신할 수 있다.
8. 작업 중에는 current `continue` sequence를 유지한다. `working`을 사용하지 않는다.
9. 한 탭의 runtime evidence를 다른 탭의 evidence로 추정하지 않는다.
10. 같은 GitHub control stream은 두 탭이 동시에 watcher ownership을 갖지 않는다.
11. 새 채팅 handoff는 이전 대화 본문이 아니라 GitHub README/control/STATE/PLAN을 기준으로 복구한다.
12. assistant output을 파싱해 token/context-limit 문구를 감지하지 않는다.
13. terminal GitHub status를 Chrome watcher Stop으로 해석하지 않는다.
14. GitHub action-confirmation UI의 존재 여부는 승인 대기 보호를 위해 감지할 수 있지만, 앱 승인 카드나 OAuth/관리자 승인 버튼을 자동 클릭하지 않는다.
15. 23분 generation watchdog은 Rerun이 자동 제출한 generation만 강제 종료할 수 있고, watcher가 꺼지면 즉시 reset되어야 한다.

## Per-tab and new-chat invariants

- 설정, runtime, draft는 Chrome tab ID별로 독립적이어야 한다.
- Start/Stop은 해당 탭 watcher에만 적용되어야 한다.
- 동일 owner/repo/branch/control path를 이미 감시 중인 다른 탭이 있으면 두 번째 Start는 거부한다.
- watcher가 켜져 있으면 `complete`, `needs_user`, `blocked`에서도 polling을 계속한다.
- terminal -> `continue` 전환은 같은 sequence라도 즉시 재개 가능해야 한다.
- `Continue in new chat` handoff 중 기존 탭은 `handoffPending`으로 normal polling을 잠시 멈춘다.
- handoff 성공 시 새 탭이 같은 GitHub run/sequence의 watcher ownership을 이어받고 기존 탭 watcher는 중지한다.
- 대화가 바뀌었다는 이유만으로 GitHub sequence를 증가시키지 않는다.

## Verification

실행하지 않은 검증을 PASS라고 쓰지 않는다. browser E2E는 실제 탭 ID, 패널 상태, 자동 prompt 도착, 오류 메시지 등 관찰 가능한 evidence가 있어야 한다. STATUS에는 이 검증 결과를 기술 용어만 나열하지 말고 사용자가 이해할 수 있는 요약으로 함께 표시한다.

## Completion

`PLAN.md`의 현재 Definition of Done과 실행 가능한 acceptance criteria가 충족되기 전 `complete`를 게시하지 않는다. 완료 시 PLAN을 먼저 완료 상태로 만들고 STATE를 다음 sequence / `complete`로 갱신한 뒤 control을 마지막 authoritative write로 일치시킨다. 이후 STATUS를 완료 상태로 갱신할 수 있다. 고정된 terminal sequence 번호를 가정하지 않는다.

`complete`가 게시되어도 Chrome watcher가 켜져 있으면 watcher는 계속 polling하며, 향후 GitHub control이 다시 `continue`가 되었을 때 새 작업을 재개할 수 있다.
