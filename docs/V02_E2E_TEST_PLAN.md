# ChatGPT Rerun v0.2 E2E Test Plan

## Scope

v0.2는 v0.1 dogfood 중간에 구조가 바뀌었으므로 이전 run의 남은 E2E-003/004를 그대로 이어서 PASS 처리하지 않는다. v0.1에서 관찰된 evidence는 보존하되, 현재 head는 새 run으로 다시 검증한다.

검증 대상:

1. Side Panel과 설정/runtime이 Chrome tab ID별로 분리되는가.
2. 한 탭의 Start/Stop이 다른 탭 세션에 영향을 주지 않는가.
3. 같은 GitHub control stream의 동시 실행이 차단되는가.
4. 기존 new-sequence dispatch와 same-sequence retry가 per-tab runtime에서도 유지되는가.
5. `Continue in new chat`이 기존 탭을 멈추고 새 ChatGPT 탭으로 같은 GitHub run/sequence를 이관하는가.
6. 새 채팅이 이전 대화 본문 없이 GitHub STATE에서 재개하는가.
7. terminal `complete`가 해당 탭 세션만 중지하는가.

## Run gate

코드 변경 후 로컬 unpacked extension이 최신 `agent/mvp-autoresume` head로 Reload되기 전에는 자동 E2E를 시작하지 않는다.

따라서 새 run은 초기 `needs_user`로 시작한다. 사용자가 Reload 완료를 확인한 뒤 control을 `continue`로 전환한다.

## V02-001 — tab-scoped panel and storage

1. ChatGPT tab A와 B를 연다.
2. 각 탭에서 확장 아이콘을 눌러 Side Panel을 연다.
3. 두 패널의 `Chrome tab` ID가 서로 다른지 확인한다.
4. A의 Owner/Repo에 값을 입력하고 B에서 다른 값을 입력한다.
5. 탭을 오가며 draft가 섞이지 않는지 확인한다.
6. A에서 Start 후 B runtime이 Stopped인지 확인한다.

PASS: 각 탭이 별도 panel/storage/runtime을 유지한다.

## V02-002 — same-stream collision guard

1. A를 특정 owner/repo/branch/control path로 실행한다.
2. B를 같은 네 좌표로 설정한다.
3. B에서 Start를 누른다.

PASS: B가 시작되지 않고 `같은 GitHub control stream이 이미 tab ...에서 실행 중` 오류가 표시된다. A는 계속 실행된다.

별도 stream을 가진 실제 프로젝트가 준비되면 B에 다른 좌표를 넣고 A/B 동시 실행도 확인한다.

## V02-003 — core rerun regression

A에서 기존 v0.1 흐름을 최소한 다시 확인한다.

1. 새 sequence `continue`가 자동 전송된다.
2. control을 그대로 둔 same-sequence retry가 자동 전송된다.
3. retry 한도와 max sends가 tab A에만 적용된다.

PASS: v0.1 dispatch/retry 동작이 per-tab storage refactor 뒤에도 유지된다.

## V02-004 — Continue in new chat

1. 실행 중인 tab A에서 **Continue in new chat**을 누른다.
2. 새 `chatgpt.com` 탭 C가 열리는지 확인한다.
3. A runtime이 `handed_off_to_tab_<C>`로 중지되는지 확인한다.
4. C의 config/runtime이 A에서 복사되었는지 확인한다.
5. C에 handoff prompt가 자동으로 전송되는지 확인한다.
6. prompt에 owner/repo, branch, control path, run_id, sequence가 포함되는지 확인한다.
7. C가 `.chatgpt-rerun` 문서를 읽고 GitHub의 최신 실제 상태를 우선하는지 확인한다.
8. 이전 대화 본문을 요구하지 않고 STATE의 미완료 지점부터 재개하는지 확인한다.

PASS: 동일 GitHub workflow의 소유권이 A에서 C로 한 번만 이동하며 중복 prompt가 없다.

## V02-005 — handoff race/failure behavior

- handoff 중 기존 tab은 `handoffPending`이라 normal polling을 하지 않아야 한다.
- 새 탭 준비 전에 오류가 나면 기존 tab의 `handoffPending`이 해제되어야 한다.
- ownership 이전 후 새 탭 prompt 전송이 실패하면 새 tab은 `handoff_send_failed`로 멈춰야 한다.

## V02-006 — terminal isolation

한 tab의 control이 `complete`, `needs_user`, `blocked`가 되었을 때 해당 tab만 중지되는지 확인한다. 다른 stream을 실행 중인 다른 tab 세션은 그대로 유지되어야 한다.

## Pass criteria

- V02-001~006의 실행 가능한 항목에 실제 evidence가 기록된다.
- multi-tab 설정/runtime이 섞이지 않는다.
- 동일 stream 중복 실행이 차단된다.
- new-chat handoff가 GitHub state만으로 작업을 복원한다.
- handoff 동안 중복 자동 전송이 없다.
- 기존 dispatch/retry/terminal 동작에 regression이 없다.
- 각 ChatGPT 실행은 20분 hard stop 정책을 따른다.
