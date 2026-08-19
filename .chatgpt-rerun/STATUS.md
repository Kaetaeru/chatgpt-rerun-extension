# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-19T17:55:00Z` (02:55 KST, Aug 20) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.14` |
| Live project | `Kaetaeru/SimpleVTT @ main` |
| Browser verification | PENDING v0.2.14 RELOAD |

## v0.2.14 — 23분 stuck-generation watchdog

가끔 ChatGPT 응답이 오류/프리즈로 중간에 멈추면서도 generation 상태가 끝나지 않아 Rerun이 영구 대기하는 문제를 위한 fail-safe를 추가했습니다.

- 정상 assistant 규칙: 약 18분에 checkpoint, 20분 전에 응답 종료
- browser fail-safe: Rerun이 실제 자동 제출한 generation이 **active generating time 23분**을 넘으면 현재 ChatGPT Stop 버튼을 한 번 자동 클릭
- watcher가 Watching인 Rerun-owned generation에만 적용
- watcher Stop 시 watchdog reset
- Rerun이 제출하지 않은 일반 수동 ChatGPT 응답은 watchdog을 새로 arm하지 않음
- GitHub action-confirmation 카드에서 사용자의 승인을 기다리는 시간은 23분 active time에서 제외
- Stop 후 ChatGPT가 idle로 돌아오면 기존 GitHub control / same-sequence retry / fresh-authorization 경로가 다시 continuation을 결정
- GitHub control/sequence는 watchdog이 임의로 변경하지 않음

## 기존 수정 유지

- same-sequence의 새 `updated_at`은 fresh authorization
- lifetime `Max sends` 제한 없음
- `Sent`는 진단 통계만
- unchanged control generation만 `Retries / sequence`로 제한
- public GitHub REST rate limit은 watcher Stop이 아니라 pause/resume
- `GitHub 승인 후 자동 계속`은 승인 카드 대기 중 retry를 억제하고 수동 승인 후 자동 재개하며 승인 UI 자체는 클릭하지 않음

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.14 Reload**
2. 기존 SimpleVTT ChatGPT 탭으로 돌아감
3. watcher를 Watching으로 유지/Start
4. 정상 작업이 20분 전에 종료되는 기존 규칙을 우선 확인
5. watchdog은 실제 23분 stuck case 또는 local-only 축소 threshold probe로 확인
6. threshold 도달 시 Rerun-owned 응답의 Stop이 한 번 자동 클릭되는지 확인
7. Stop 뒤 watcher가 계속 Watching이고 Start 재클릭 없이 continuation이 가능한지 확인
8. GitHub 승인 대기 시간은 watchdog에서 제외되는지 확인
9. watcher를 Stop한 일반 수동 응답은 watchdog이 끊지 않는지 확인

## 검증 상태

- v0.2.14 remote source/regression assertions: COMMITTED
- manifest/package: `0.2.14`
- exact latest full npm suite: NOT_RUN — 이 runtime에 exact GitHub checkout이 없음
- live 23-minute forced Stop: PENDING
- live approval-card behavior: PENDING

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
