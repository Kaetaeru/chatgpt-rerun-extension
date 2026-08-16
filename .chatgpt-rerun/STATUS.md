# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T14:30:00Z` (23:30 KST) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `5` |
| Control status | `needs_user` |
| Current task | `V02-007` |
| Activity | Waiting for user Reload |
| Extension version to verify | `0.2.1` |
| Overall dogfood | IN_PROGRESS |

## 지금 무슨 일이 진행 중인가

사용자가 요청한 UX 변경으로 Side Panel의 별도 `Start this tab` / `Stop this tab` 버튼을 하나의 상태 기반 버튼으로 합쳤습니다.

- 중지 상태: `Start`
- 실행 상태: `Stop`
- `Stop` 클릭 후: 다시 `Start`
- 이 버튼은 현재 Chrome 탭의 runtime만 제어합니다.

코드와 정적 UI 회귀 테스트는 반영됐고, 현재는 **Chrome에 로드된 unpacked extension을 0.2.1로 Reload한 뒤 실제 브라우저에서 Start → Stop → Start 전환을 확인하는 단계**입니다.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | IN_PROGRESS | 새 owner continuity 및 safeguard 검증이 남음 |
| V02-006 terminal isolation | PENDING | terminal 상태가 owning tab만 멈추는지 남음 |
| V02-007 단일 Start/Stop 토글 | IN_PROGRESS | 코드 PASS, Chrome Reload 후 브라우저 확인 필요 |

## 최근 확인된 것

- v0.2.1 `popup.js` 문법 검사 PASS.
- 단일 `sessionToggle` 회귀 테스트 PASS.
- 기존 별도 Start/Stop DOM 버튼은 제거됨.
- GitHub 앱 반복 사용 승인은 ChatGPT 앱 권한의 persisted automatic approval 설정으로 처리하도록 정리됨.
- 새 채팅 handoff는 이전 대화 본문을 복사하지 않고 GitHub `STATE.md`에서 복구함.

## 지금 사용자가 해야 할 것

`chrome://extensions`에서 ChatGPT Rerun unpacked extension을 최신 `agent/mvp-autoresume`의 **v0.2.1**로 Reload합니다.

그 다음 Side Panel에서 다음 한 가지 흐름만 확인하면 됩니다:

`Stopped + Start` → Start 클릭 → `Running + Stop` → Stop 클릭 → `Stopped + Start`

## 그 다음 자동 작업

V02-007 브라우저 검증이 끝나면 현재 `needs_user` gate를 해제하고, 미완료인 V02-005 handoff safeguard와 V02-006 terminal isolation 검증을 재개합니다.

## Blockers / risks

- 현재 blocker는 코드 문제가 아니라 **로컬 Chrome의 unpacked extension Reload 필요**입니다.
- `STATUS.md` 자체는 표시용 projection이므로 stale할 수 있습니다. 자동화 판단에는 사용하지 않습니다.

## Freshness policy

이 파일은 다음 규칙으로 갱신합니다.

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 **최대 약 5분**을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 반드시 갱신.
- 내용 변화가 없으면 불필요한 GitHub 커밋을 만들기 위해 다시 쓰지 않음.
- ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 시계만 맞추기 위한 빈 갱신은 하지 않음.

`control.json`은 마지막 **authoritative** state write입니다. STATUS는 필요하면 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
