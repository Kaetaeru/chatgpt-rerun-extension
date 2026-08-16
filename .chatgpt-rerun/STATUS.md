# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T15:02:00Z` (00:02 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `5` |
| GitHub work status | `needs_user` |
| Current task | `V02-007` |
| Activity | Waiting for v0.2.4 Reload; watcher/work-state separation implemented |
| Extension version to verify | `0.2.4` |
| Overall dogfood | IN_PROGRESS |

## 지금 무슨 일이 진행 중인가

v0.2.4에서 **Chrome 탭 watcher와 GitHub 작업 상태를 완전히 분리**했습니다.

이제 Side Panel의 `Start / Stop`은 현재 ChatGPT 탭이 GitHub control을 계속 감시할지 여부만 결정합니다.

- `Start` → 이 탭 watcher를 켜고 설정된 poll 주기로 GitHub를 계속 확인
- `Stop` → 이 탭 watcher를 명시적으로 끔
- GitHub `continue` → 작업 시작/재개 신호
- GitHub `complete / needs_user / blocked` → 현재 작업 dispatch는 대기하지만 watcher는 계속 켜져 있음

따라서 작업이 `complete`가 되거나 사람 입력을 기다리는 `needs_user`가 되어도 탭 watcher는 자동으로 꺼지지 않습니다. 나중에 GitHub control이 다시 `continue`가 되면 사용자가 Start를 다시 누르지 않아도 자동 재개하도록 구현했습니다.

같은 sequence가 `complete/needs_user/blocked -> continue`로 바뀌는 경우도 새 작업 허가로 취급하도록 내부 handled-sequence를 안전하게 re-arm합니다. 따라서 same-sequence retry delay를 기다리는 동작과 구분됩니다.

## Side Panel에서 보이는 두 상태

v0.2.4는 Side Panel에 두 축을 따로 표시합니다.

- `Tab watcher`: `Watching` 또는 `Stopped`
- `GitHub work status`: `continue · start`, `complete`, `needs_user`, `blocked`

예를 들어 정상적인 대기 상태는 다음처럼 보일 수 있습니다.

`Tab watcher = Watching` + `GitHub work status = needs_user`

이 상태에서도 GitHub polling은 계속됩니다.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 watcher Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | PAUSED | 최신 browser gates 이후 남은 safeguard 확인 |
| V02-006 persistent watcher | PENDING | terminal에서도 Watching 유지 + polling + 나중 continue 자동 재개 확인 필요 |
| V02-007 단일 Start/Stop watcher | IN_PROGRESS | v0.2.4 Reload 후 `Start -> Stop -> Start`와 상태 분리 확인 필요 |
| V02-008 Rerun 연결 프롬프트 | PARTIAL | 현재 프로젝트 active-run 보존/reconciliation 경로 확인; 새 프로젝트 생성 경로는 별도 검증 필요 |

## 최근 확인된 것

- `background.js`의 terminal GitHub 상태 처리에서 watcher를 끄는 `stopSession()` 경로를 제거하고 `wait`로 변경했습니다.
- terminal sequence 뒤 같은 sequence가 다시 `continue`가 될 때 즉시 재개할 수 있도록 handled sequence를 re-arm합니다.
- `max_runs`, `retry_limit`, `sequence_regressed`는 watcher Stop이 아니라 dispatch Wait로 바뀌었습니다.
- terminal 상태에서 새 채팅 handoff를 눌러도 기존 watcher를 끄지 않고 요청만 거부합니다.
- Side Panel은 `Running` 대신 `Watching GitHub`를 사용하고 `Tab watcher`와 `GitHub work status`를 따로 보여줍니다.
- `tests/watcher-flow.test.mjs`를 추가하고 `tests/popup-ui.test.mjs`를 새 UI 의미에 맞게 갱신했습니다.
- `.chatgpt-rerun/README.md`와 `docs/V02_E2E_TEST_PLAN.md`도 watcher/work-state 분리 규칙으로 갱신했습니다.
- `manifest.json` / `package.json` 버전은 `0.2.4`입니다.
- 전체 최신 checkout의 `npm run check` / `npm test`는 현재 container의 GitHub DNS 제한 때문에 실행하지 못했으며 PASS로 기록하지 않습니다.

## 지금 사용자가 해야 할 것

`chrome://extensions`에서 ChatGPT Rerun unpacked extension을 최신 `agent/mvp-autoresume`의 **v0.2.4**로 Reload합니다.

그 다음 현재 GitHub control이 이미 `needs_user`인 상태를 그대로 이용해 첫 검증을 할 수 있습니다.

1. Side Panel에서 watcher가 Stopped면 `Start`를 누릅니다.
2. `Tab watcher = Watching`이고 버튼이 `Stop`으로 바뀌는지 확인합니다.
3. 동시에 `GitHub work status = needs_user`인지 확인합니다.
4. 이 상태로 설정된 poll interval보다 오래 두어도 watcher가 Stopped로 바뀌지 않는지 확인합니다.
5. 새 resume prompt가 전송되지 않는 것도 확인합니다.

이 관찰이 끝나면 다음 단계에서 GitHub control을 같은 seq 5의 `continue`로 바꿔 **Start를 다시 누르지 않고 자동 재개되는지** 검증합니다.

## 그 다음 자동 작업

- V02-007 watcher Start/Stop UI를 먼저 닫습니다.
- 바로 V02-006 terminal-wait/polling/terminal->continue 자동 재개를 검증합니다.
- 이후 V02-008 새 프로젝트 연결 경로와 남은 V02-005 safeguard를 정리합니다.

## Blockers / risks

- 현재 blocker는 코드 문제가 아니라 **로컬 Chrome의 unpacked extension v0.2.4 Reload 필요**입니다.
- Max sends 같은 안전 한도가 이미 소진된 경우 watcher는 계속 감시하지만 dispatch는 해당 guard에 의해 보류될 수 있습니다.
- composer draft 보호나 prompt 전송 실패 같은 브라우저 안전 문제는 여전히 watcher를 중지할 수 있습니다.
- `STATUS.md` 자체는 표시용 projection이므로 stale할 수 있으며 자동화 판단에는 사용하지 않습니다.

## Freshness policy

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 갱신.
- 내용 변화가 없으면 시각만 바꾸기 위한 heartbeat commit은 만들지 않음.
- ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 빈 주기 갱신을 만들지 않음.

`control.json`은 마지막 **authoritative** state write입니다. STATUS는 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
