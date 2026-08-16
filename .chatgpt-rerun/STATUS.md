# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T19:01:00Z` (04:01 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `continue` |
| Current task | `V02-009` |
| Extension version | `0.2.10` |
| API polling observed | `Public · rate-safe` |
| Browser verification | LIVE DISPATCH / HANDOFF PROBE |

## 방금 확인된 원인

사용자는 `Public · rate-safe`가 보이는데 자동 작업이 시작되지 않는다고 보고했습니다.

원인은 API polling이 아니라 GitHub work state였습니다. 당시 authoritative `control.json`이 아직 `needs_user`였기 때문에 watcher는 정상적으로 GitHub를 감시하면서도 resume prompt를 보내지 않았습니다. `Public · rate-safe`는 토큰 없는 보수적 polling 모드라는 뜻일 뿐 work-start 신호가 아닙니다.

## 지금 상태

v0.2.10 Reload/UI 확인이 끝났으므로 같은 sequence 9를 `continue`로 재무장했습니다.

watcher가 이미 켜져 있다면 사용자가 Start를 다시 누르면 안 됩니다. terminal -> continue 전환을 watcher가 새 실행 허가로 감지해서 자동 resume prompt를 보내야 합니다.

한도에 도달한 기존 대화이거나 입력창에 Rerun이 남긴 stale resume prompt가 있다면, 현재 탭에서 계속 실패하는 대신 fresh ChatGPT 탭 하나를 열고 watcher ownership을 넘기는 것이 기대 동작입니다.

## 현재 검증 포인트

1. Start 재클릭 없이 자동 prompt dispatch가 발생하는가.
2. prompt가 단순 paste가 아니라 실제 submit되는가.
3. exhausted/stale-prompt chat이면 fresh tab 하나가 자동 생성되는가.
4. 새 탭으로 watcher ownership이 이동하는가.
5. rate-limit이 다시 발생하면 watcher가 Stop되지 않고 `Paused until ...`로 대기하는가.

## 현재 검증 한계

- `Public · rate-safe` UI load는 사용자 관찰로 확인됨.
- explicit `Paused until ...` browser path는 아직 실제 관찰되지 않음.
- 최신 exact full npm suite는 현재 환경에서 아직 NOT_RUN.
- V02-009는 live browser 자동 dispatch/fresh handoff가 확인될 때까지 완료 처리하지 않음.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
