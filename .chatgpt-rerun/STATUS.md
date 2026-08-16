# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T18:20:00Z` (03:20 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.9` |
| Previous V02-001~008 | PASS |
| v0.2.8 exhausted-chat probe | FAIL — returned to Start, no new tab |
| v0.2.9 browser verification | PENDING RELOAD |

## 이번에 확인된 실제 원인

v0.2.8에서 자동 fresh-chat handoff를 추가했지만 사용자가 같은 한도 도달 채팅에서 다시 Start했을 때 버튼이 다시 Start로 돌아왔고 새 탭은 열리지 않았습니다.

원인은 auto-handoff catch보다 앞에 있던 `composer_not_empty` 안전장치였습니다. 이전 실패 때 Rerun이 넣어둔 resume prompt가 입력창에 그대로 남아 있으면, 다음 Start는 그 텍스트를 사용자 draft로 오인해서 즉시 watcher를 Stop했습니다. 따라서 새 탭 생성 로직까지 도달하지 못했습니다.

## v0.2.9 수정

- Start/poll 시 composer의 기존 텍스트를 현재 Rerun resume prompt와 비교
- 공백 차이를 정규화한 뒤 정확히 같은 경우만 `stale Rerun-owned prompt`로 인정
- stale Rerun prompt면 `composer_not_empty`로 Stop하지 않고 즉시 `HANDOFF_NEW_CHAT` 시도
- 다른 비어 있지 않은 텍스트는 기존처럼 사용자 draft로 보호하고 Stop
- prompt/editor synchronization failure도 one-shot fresh-chat fallback 대상으로 포함
- handoff 자체가 실패하면 `auto_handoff_failed`로 안전정지하고 구체 오류를 Side Panel에 남김
- fresh-chat direct handoff 실패는 다시 새 탭을 열지 않아 무한 루프 방지
- assistant 답변이나 한도 안내 문구는 읽거나 파싱하지 않음

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.9 Reload**
2. 가능하면 아까 실패 후 남아 있는 Rerun resume prompt를 입력창에 그대로 둠
3. 같은 한도 도달 채팅에서 Start
4. 이번에는 즉시 Start로 되돌아가지 않고 fresh ChatGPT 탭 하나가 열리는지 확인
5. 새 탭에서 handoff prompt가 자동 제출되는지 확인
6. 새 탭 watcher가 ownership을 이어받아 Watching인지 확인

입력창에 Rerun prompt가 아닌 사용자가 직접 쓴 다른 내용이 있다면 새 탭을 열지 않고 Stop하는 것이 정상입니다.

## 현재 검증 한계

- v0.2.9 source와 regression assertions는 GitHub에 반영됨
- 최신 exact checkout의 전체 npm suite는 현재 실행 환경에서 다시 돌리지 못했으므로 PASS라고 주장하지 않음
- 실제 exhausted-chat browser E2E는 Reload 후 사용자 관찰이 필요

## Freshness policy

의미 있는 상태/task/검증 변화가 있으면 즉시 갱신합니다. 내용이 동일하면 시각만 바꾸는 heartbeat commit은 만들지 않습니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
