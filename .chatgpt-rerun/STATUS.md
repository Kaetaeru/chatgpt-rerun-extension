# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T17:20:00Z` (02:20 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.6` |
| Previous V02-001~008 | PASS |
| v0.2.6 targeted syntax | PASS |
| v0.2.6 auto-submit tests | PASS — 4/4 |
| Formal project DoD | REOPENED FOR AUTO-SUBMIT REGRESSION |

## 발견된 회귀

사용자가 Start를 눌렀을 때 Rerun 재개 프롬프트가 ChatGPT 입력창에는 들어가지만 실제 전송이 바로 되지 않는 현상을 확인했습니다.

이 동작은 정상 동작이 아닙니다. Rerun의 자동 dispatch는 **프롬프트 입력 + 실제 전송**까지 포함해야 합니다. 사용자가 별도로 Send를 누르거나 Enter를 눌러야 한다면 실패입니다.

## v0.2.6 수정

`content.js`의 제출 경로를 보강했습니다.

1. 프롬프트 삽입 뒤 explicit input/change 이벤트로 ChatGPT editor state 동기화 시도
2. 실제 composer에 프롬프트가 들어갔는지 확인
3. 활성 Send 버튼을 최대 4초 기다린 뒤 클릭
4. 활성 Send 버튼이 나타나지 않으면 Enter 제출 fallback
5. composer가 비워지거나 사라지거나 ChatGPT 생성이 시작된 것을 확인한 뒤에만 sequence ACK
6. 제출 증거가 없으면 성공한 척하지 않고 send failure 처리

새 `tests/content-send.test.mjs`를 추가했고 exact v0.2.6 `content.js`에 대해 문법 확인 및 targeted tests 4/4가 통과했습니다.

## 지금 필요한 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.6**을 Reload합니다.
2. 이 탭의 watcher는 Reload 뒤 다시 Start할 수 있습니다.
3. GitHub work state는 현재 `needs_user`라 자동 실행하지 않습니다.
4. Reload가 끝났다고 알려주면 GitHub를 `continue`로 전환해 자동 프롬프트가 **입력뿐 아니라 실제 전송까지 되는지** 확인합니다.

## Blockers / risks

- 실제 ChatGPT UI에서의 v0.2.6 제출 동작은 아직 browser NOT_RUN입니다.
- 이전 V02-001~008 증거는 그대로 유효하며 반복하지 않습니다.
- PR #1은 사용자 요청 없이 merge하지 않습니다.

## Freshness policy

의미 있는 상태/task/검증 변화가 있으면 즉시 갱신합니다. 내용이 동일하면 시각만 바꾸는 heartbeat commit은 만들지 않습니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
