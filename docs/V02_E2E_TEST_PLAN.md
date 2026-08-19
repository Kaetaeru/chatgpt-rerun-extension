# ChatGPT Rerun v0.2.x E2E Test Plan

## Scope

v0.2는 구조 변경을 단계적으로 dogfood한다. v0.2.1은 단일 Start/Stop watcher 토글, v0.2.2는 missing-control bootstrap fallback, v0.2.3은 명시적 Rerun 연결 프롬프트, v0.2.4는 Chrome watcher와 GitHub work state 분리, v0.2.5는 unconnected-first onboarding, v0.2.6은 자동 prompt submission 보강, v0.2.7은 fresh-chat handoff를 GitHub work status와 분리, v0.2.8~0.2.9는 exhausted-chat 자동 handoff를 보강했고, v0.2.10은 GitHub REST rate limit을 watcher Stop이 아닌 자동 polling pause로 처리한다. v0.2.11은 fresh same-sequence authorization을 복구하고, v0.2.12는 lifetime `Max sends` cap을 제거하며, v0.2.13은 GitHub action-confirmation 대기 중 retry를 억제하고 수동 승인 후 자동 재개한다. v0.2.14는 Rerun-owned generation이 23 active minutes를 넘겨 프리즈될 때 ChatGPT Stop을 눌러 recovery를 가능하게 한다.

검증 대상:

1. Side Panel과 설정/runtime이 Chrome tab ID별로 분리되는가.
2. 같은 GitHub control stream의 동시 watcher ownership이 차단되는가.
3. new-sequence dispatch와 same-sequence retry가 유지되는가.
4. `Continue in new chat`이 watcher ownership을 새 ChatGPT 탭으로 정확히 이관하는가.
5. 새 채팅이 이전 대화 본문 없이 GitHub STATE에서 복구되는가.
6. GitHub terminal 상태에서도 watcher가 polling을 계속하고 이후 `continue`에서 자동 재개하는가.
7. Start/Stop watcher UI가 실제 runtime과 일치하는가.
8. unconnected-first 신규 프로젝트 연결이 안전하게 동작하는가.
9. 자동 dispatch가 prompt 삽입뿐 아니라 실제 제출까지 완료하는가.
10. fresh-chat handoff가 `continue/complete/needs_user/blocked` 어느 상태에서도 watcher ownership을 이관하고 상태에 맞는 동작을 하는가.
11. GitHub REST rate limit이 watcher를 끄거나 Start를 실패시키지 않고, 안전한 pause/resume으로 처리되는가.
12. deliberate fresh authorizations가 lifetime send 횟수에 막히지 않는가.
13. GitHub action confirmation이 대기 중일 때 Rerun이 중복 retry하지 않고, 사용자가 승인한 뒤 자동 재개하는가.
14. Rerun이 자동 제출한 generation이 23 active minutes를 넘기면 자동 Stop되고, watcher가 꺼져 있거나 일반 수동 응답일 때는 watchdog이 개입하지 않는가.

## Run gate

코드 변경 후 unpacked extension이 최신 `agent/mvp-autoresume` head로 Reload되기 전에는 변경 동작을 browser PASS로 판정하지 않는다. Reload 대기 중에는 GitHub work state를 `needs_user`로 둘 수 있으며, 이는 watcher Stop을 의미하지 않는다.

## V02-001 — tab-scoped panel and storage

PASS: 각 ChatGPT 탭이 별도 panel/config/draft/runtime을 유지한다.

## V02-002 — same-stream collision guard

PASS: 동일 owner/repo/branch/control path의 두 번째 watcher Start는 거부된다.

## V02-003 — core rerun regression

PASS: 새 sequence와 제한적 same-sequence retry가 owning tab에서만 자동 전송되고 counters가 tab-scoped다.

## V02-004 — Continue in new chat baseline

1. watcher가 켜진 tab A에서 **Continue in new chat**을 누른다.
2. 새 ChatGPT tab C가 열린다.
3. config/runtime ownership이 C로 이동한다.
4. C에 GitHub 좌표/run/sequence가 포함된 handoff prompt가 자동 전송된다.
5. C가 GitHub 문서에서 상태를 복구한다.

PASS: 동일 workflow watcher ownership이 A에서 C로 한 번만 이동하며 중복 prompt가 없다.

## V02-005 — handoff race/failure behavior

- handoff 중 기존 tab은 `handoffPending`이라 normal polling을 하지 않는다.
- 새 탭 준비 전 오류는 기존 tab pending을 해제한다.
- ownership 이전 후 prompt 전송 실패는 새 tab을 `handoff_send_failed`로 정지한다.

## V02-006 — persistent watcher across GitHub work states

1. watcher를 Watching으로 둔다.
2. GitHub control을 terminal 상태로 둔다.
3. watcher가 계속 Watching인지 확인한다.
4. 같은 sequence 또는 새 sequence를 `continue`로 바꾼다.
5. Start 재클릭 없이 resume prompt가 자동 전송되는지 확인한다.

PASS: GitHub work state와 Chrome watcher state가 독립적이다.

## V02-007 — unified Start/Stop watcher toggle

PASS: 단일 버튼이 `Start -> Stop -> Start`로 실제 watcher runtime을 반영한다.

## V02-008 — unconnected-first explicit Rerun onboarding

### A. True unconnected state

1. 새 ChatGPT 탭은 `Repository connection = Unconnected`로 시작한다.
2. 실제 GitHub 사용 전 `Rerun 연결 프롬프트`는 `RERUN_CONNECTION: UNCONNECTED`를 보고하고 아무 파일도 쓰지 않는다.

### B. Connect from actual conversation GitHub usage

1. 같은 대화에서 test repository를 GitHub 앱으로 실제 읽는다.
2. 연결 프롬프트를 다시 누른다.
3. 하나의 repo/branch가 확정되면 README/PLAN/STATE/STATUS/control을 생성/보완한다.
4. 새 프로젝트 control은 sequence 0 / `continue`, control-last로 게시한다.
5. 연결 turn 자체는 implementation을 시작하지 않는다.
6. CONNECTED 결과의 좌표를 Side Panel에 저장하고 Start한다.
7. watcher가 첫 task를 자동 시작한다.

PASS: 실제 GitHub 사용 맥락을 근거로만 안전하게 연결된다.

## V02-009 — reliable automatic prompt submission, fresh-chat resume, and polling resilience

### A. Current-tab automatic submission

1. 최신 extension을 Reload한다.
2. 연결된 탭 watcher를 Watching 상태로 둔다.
3. GitHub control을 유효한 `continue`로 둔다.
4. resume prompt가 composer에 들어가는 것만이 아니라 사용자 Send 클릭/Enter 없이 실제 제출되는지 확인한다.
5. ChatGPT 응답 생성이 시작되는지 확인한다.

PASS-A: prompt 삽입 + 자동 제출이 하나의 dispatch로 완료된다.

### B. Exhausted-chat automatic handoff

1. 현재 채팅이 더 이상 Rerun prompt를 정상 dispatch하지 못하는 테스트 상태를 사용한다.
2. 이전 실패로 현재 Rerun resume prompt가 composer에 남아 있다면 그대로 둔다.
3. Start한다.
4. 그 텍스트가 현재 configured resume prompt와 일치하면 사용자 draft로 오인하지 않고 fresh-chat handoff를 시도하는지 확인한다.
5. 새 ChatGPT 탭 하나가 열리고 watcher ownership이 이동하는지 확인한다.
6. handoff prompt가 자동 제출되는지 확인한다.
7. 다른 사용자 작성 text가 composer에 있으면 overwrite/handoff하지 않고 안전 Stop하는지 별도로 확인한다.

PASS-B: exhausted/stale-Rerun-prompt 경로는 한 번만 fresh chat으로 복구하고 실제 사용자 draft는 보호한다.

### C. Fresh-chat handoff across GitHub work states

1. `continue` 상태에서 **Continue in new chat**을 눌러 새 탭이 열리고 handoff prompt가 자동 제출되며 미완료 작업을 재개하는지 확인한다.
2. `needs_user`, `complete`, 또는 `blocked` 상태에서도 handoff가 status 때문에 거부되지 않는지 확인한다.
3. terminal handoff는 repo/run context만 복구하고 실제 implementation task는 시작하지 않는지 확인한다.
4. 새 탭 watcher가 계속 Watching인지 확인한다.
5. 이후 GitHub를 유효한 `continue`로 바꾸면 Start를 다시 누르지 않아도 새 탭에서 자동 resume되는지 확인한다.

PASS-C: fresh-chat watcher ownership은 GitHub work status와 독립적이다.

### D. GitHub REST rate-limit resilience

1. 최신 extension을 Reload한다.
2. GitHub API quota가 exhausted된 상태에서 Start할 수 있으면 그 상태로 Start한다.
3. expected: watcher가 `Watching`을 유지하고 버튼이 `Stop`이며 `API polling = Paused until ...`로 표시된다.
4. red fatal rate-limit error 때문에 Start로 되돌아가면 FAIL이다.
5. reset/retry 시각이 지나면 watcher를 다시 Start하지 않아도 polling을 자동 재개하는지 확인한다.
6. quota가 reset되어 재현이 어렵다면 token 없는 상태에서 `API polling = Public · rate-safe`를 확인한다.
7. GitHub token을 사용하는 경우 `API polling = Authenticated · conditional`을 확인하고 Poll seconds 5~10 설정이 허용되는지 확인한다.
8. 여러 unauthenticated watcher가 있으면 effective polling이 watcher 수에 따라 보수적으로 느려져 aggregate public request budget을 보호해야 한다.

PASS-D: GitHub API의 server-side rate limit은 준수하지만, 그 제한 때문에 Rerun watcher가 꺼지거나 사용자가 Start를 반복해야 하지 않는다.

### E. GitHub action-confirmation wait and manual-approval resume

1. Side Panel에서 **GitHub 승인 후 자동 계속**을 체크하고 `Save connection`을 누른다.
2. GitHub write action이 `ChatGPT가 GitHub을(를) 사용하도록 허용할까요?` 형태의 action-confirmation 카드를 띄우게 한다.
3. 카드를 승인하지 않은 채 retry delay보다 오래 기다린다.
4. expected: Rerun은 승인 카드가 보이는 동안 `POLL`을 보내지 않아 동일 control의 resume prompt를 중복 전송하지 않는다.
5. expected: Rerun은 `허용하기`, `대화에서 허용하기`, `Allow` 버튼/드롭다운을 자동 클릭하지 않는다.
6. 사용자가 직접 승인한다.
7. 카드가 사라지면 기본 2초 content tick 안팎에서 Rerun polling이 자동 재개되고, watcher를 다시 Start할 필요가 없어야 한다.
8. 새 채팅 handoff 뒤에도 config가 복사되므로 같은 옵션이 유지되는지 확인한다.

PASS-E: 승인 결정은 사용자에게 남아 있고, 승인 대기 때문에 Rerun이 중복 retry하거나 수동 Start를 요구하지 않는다.

### F. 23-minute stuck-generation watchdog

1. v0.2.14를 Reload하고 watcher를 Watching으로 둔다.
2. Rerun이 resume/handoff/bootstrap prompt를 실제로 자동 제출해 generation을 시작하게 한다.
3. 정상 구현 규칙은 18분부터 checkpoint, 20분 전에 종료하는 것이며 이 규칙을 우선 확인한다.
4. 테스트에서는 generation이 비정상적으로 계속 활성 상태인 조건을 사용하거나 개발용으로 시간을 축소한 동등 source/unit probe를 사용한다.
5. expected: Rerun이 제출한 generation의 **active generating time**이 23분을 넘으면 현재 visible/actionable ChatGPT Stop 버튼을 한 번 클릭한다.
6. GitHub action-confirmation 카드에서 수동 승인을 기다리는 시간은 active-generation 누적 시간에서 제외한다.
7. Stop 후 ChatGPT가 idle로 돌아오면 watchdog state가 reset되고, 현재 GitHub control이 계속 `continue`라면 기존 same-sequence continuation/retry 경로가 다시 평가되어야 한다.
8. watcher를 Stop한 상태나 Rerun이 제출하지 않은 일반 수동 ChatGPT generation에서는 watchdog이 강제 종료하면 안 된다.

PASS-F: 20분 assistant 규칙 실패 시 23분 browser fail-safe가 stuck generation을 끊고 Rerun recovery를 허용하며, 일반 대화와 승인 대기는 잘못 종료하지 않는다.

## Start fallback regression

연결 프롬프트를 건너뛰고 사용자가 Owner/Repository/Branch를 직접 입력한 경우, 표준 `.chatgpt-rerun/control.json`이 없고 repo/branch가 읽히면 bootstrap fallback이 동작한다. custom missing control path와 접근 불가능한 repo/branch는 자동 생성하지 않는다.

## Pass criteria

- 기존 V02-001~008 verified evidence는 영향 없는 한 유지한다.
- V02-009 A/B/C/D/E/F의 실행 가능한 실제 browser evidence가 기록된다.
- 자동 dispatch는 prompt paste가 아니라 실제 submission까지 포함한다.
- exhausted chat은 사용자 draft를 훼손하지 않으면서 한 번의 fresh-chat handoff로 복구한다.
- new-chat handoff는 terminal GitHub status 때문에 거부되지 않는다.
- terminal handoff는 구현을 시작하지 않고 watcher를 유지한다.
- GitHub rate limit은 watcher Stop이 아니라 pause/resume으로 처리한다.
- lifetime send count는 valid authorization을 막지 않는다.
- GitHub action confirmation은 자동 클릭하지 않고, 승인 대기 중 duplicate retry를 억제하며 수동 승인 후 자동 재개한다.
- 23분 generation watchdog은 Rerun-owned active generation만 강제 종료하고 승인 대기 시간과 일반 수동 응답은 제외한다.
- watchdog 강제 종료 뒤에도 watcher/continuation 상태는 살아 있어야 한다.
- 이후 `continue`는 새 채팅에서 Start 재클릭 없이 자동 재개된다.
- handoff 실패/중복 race guard는 유지된다.
- 각 ChatGPT 실행은 여전히 20분 hard stop 정책을 따른다. 23분은 그 정책 실패를 회복하기 위한 browser fail-safe다.
