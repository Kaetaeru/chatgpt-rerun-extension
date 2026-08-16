# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T18:12:00Z` (03:12 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.8` |
| Previous V02-001~008 | PASS |
| Browser verification | PENDING RELOAD |

## 이번에 확인된 증상

한도에 도달한 기존 ChatGPT 채팅에서 Start를 누르면 watcher가 잠깐 켜졌다가 즉시 다시 Stopped가 되어 버튼이 Start로 돌아왔습니다.

원인은 Start 자체가 아니라 그 직후 `continue` dispatch였습니다. 확장프로그램이 resume prompt를 넣고 Send/Enter를 시도했지만 실제 전송 증거를 얻지 못하면 기존 코드는 sequence claim을 풀고 곧바로 `STOP_SESSION`을 호출했습니다. 그래서 사용자는 watcher가 바로 꺼진 것처럼 보였습니다.

## v0.2.8 수정

- resume prompt가 실제 composer에 들어간 뒤 Send/Enter 모두 dispatch를 만들지 못한 경우를 confirmed dispatch failure로 분류
- sequence claim을 먼저 release
- 현재 tab ID를 `REGISTER_CHAT_TAB` 응답으로 확인
- 기존 `HANDOFF_NEW_CHAT` 경로를 자동 호출
- 성공하면 old tab watcher는 fresh tab으로 ownership transfer
- handoff 실패 시에만 `auto_handoff_failed`로 안전정지
- 일반 composer/스크립트 오류는 기존처럼 안전정지하며 surprise new tab을 만들지 않음
- fresh-chat handoff prompt 자체 실패는 다시 handoff하지 않아 무한 새 탭 루프를 만들지 않음
- assistant 답변이나 한도 안내 문구는 파싱하지 않음

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.8 Reload**
2. 같은 한도 도달 채팅/동일 테스트 프로젝트를 사용
3. GitHub control이 유효한 `continue`일 때 Start
4. 기존 탭이 단순히 Start로 되돌아가는 대신 fresh ChatGPT 탭 하나가 자동으로 열리는지 확인
5. 새 탭에서 handoff prompt가 자동 제출되는지 확인
6. 새 탭 watcher가 ownership을 이어받아 Watching인지 확인

## 현재 검증 한계

- v0.2.8 source와 회귀 테스트 변경은 GitHub에 반영됨
- 최신 exact checkout의 전체 npm suite는 현재 실행 환경에서 다시 돌리지 못했으므로 PASS라고 주장하지 않음
- 실제 exhausted-chat browser E2E는 Reload 후 사용자 관찰이 필요

## Freshness policy

의미 있는 상태/task/검증 변화가 있으면 즉시 갱신합니다. 내용이 동일하면 시각만 바꾸는 heartbeat commit은 만들지 않습니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
