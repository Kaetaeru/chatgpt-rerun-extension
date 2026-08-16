# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T18:01:00Z` (03:01 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.7` |
| Previous V02-001~008 | PASS |
| v0.2.6 auto-submit targeted tests | PASS — 4/4 |
| v0.2.7 handoff logic targeted check | PASS |
| Browser verification | PENDING RELOAD |

## 새 채팅 자동 재시작 문제 확인

사용자가 새 채팅에서 자동 재시작이 되지 않는다고 보고했습니다.

확인 결과 실제 설계 불일치가 있었습니다. v0.2.4부터 Chrome watcher와 GitHub work status는 독립적이어야 하지만, `Continue in new chat`에는 예전 규칙이 남아 있어 `control.status !== continue`이면 handoff 자체를 거부하고 있었습니다.

현재 이 프로젝트 control도 `needs_user`이므로 구버전에서는 바로 그 조건에 걸릴 수 있습니다.

## v0.2.7 수정

- `continue`, `complete`, `needs_user`, `blocked` 어느 상태에서도 fresh-chat watcher ownership transfer 허용
- handoff prompt에 owner/repo, branch, control path, run_id, sequence, status, task_id 포함
- `continue`면 새 채팅이 GitHub STATE에서 실제 미완료 작업 재개
- terminal이면 repo/run context만 복구하고 implementation은 시작하지 않음
- terminal handoff 뒤에도 새 탭 watcher는 계속 polling
- 이후 GitHub가 `continue`가 되면 Start 재클릭 없이 새 탭에서 자동 재개
- v0.2.6의 composer 동기화 + Send/Enter fallback + dispatch evidence 확인을 `RERUN_HANDOFF`에도 그대로 사용

## 현재 검증

- remote `background.js`에서 terminal handoff 차단 제거: PASS
- status-aware handoff prompt targeted check: PASS
- watcher-flow regression test 수정: COMMITTED
- handoff-status regression test 추가: COMMITTED
- 실제 Chrome v0.2.7 fresh-chat handoff: NOT_RUN
- 실제 Chrome v0.2.7 prompt auto-submit: NOT_RUN

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.7 Reload**
2. 현재/테스트 탭 watcher를 Start해서 Watching 상태 확인
3. GitHub work status가 `needs_user`인 상태에서도 **Continue in new chat** 실행
4. 새 탭이 열리고 handoff prompt가 자동 제출되는지 확인
5. 새 탭에서 구현은 시작하지 않고 context만 복구하는지 확인
6. 새 탭 watcher가 Watching인지 확인
7. 그 뒤 GitHub를 `continue`로 바꾸면 Start를 다시 누르지 않아도 자동 resume가 제출되는지 확인

## Blockers / risks

- v0.2.7 실제 browser evidence가 아직 없습니다.
- 최신 전체 npm suite는 현재 container의 GitHub DNS 제한 때문에 다시 실행하지 못했습니다. targeted logic check만 PASS입니다.
- PR #1은 사용자 요청 없이 merge하지 않습니다.

## Freshness policy

의미 있는 상태/task/검증 변화가 있으면 즉시 갱신합니다. 내용이 동일하면 시각만 바꾸는 heartbeat commit은 만들지 않습니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
