# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T15:15:00Z` (00:15 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `5` |
| GitHub work status | `continue` |
| Current task | `V02-007` |
| Activity | Same-sequence terminal -> continue auto-resume probe armed |
| Extension version | `0.2.4` |
| Overall dogfood | IN_PROGRESS |

## 지금 무슨 일이 진행 중인가

v0.2.4의 Chrome tab watcher와 GitHub work state 분리를 실제 브라우저에서 검증 중입니다.

방금 전 GitHub control이 seq 5 / `needs_user`인 동안 사용자가 Side Panel에서 watcher가 **Watching**이라고 확인했습니다. 즉 terminal GitHub 상태가 watcher를 끄지 않는 조건은 실제로 관찰됐습니다.

이제 사용자가 Start를 다시 누르지 않은 상태에서 동일한 run / 동일한 seq 5 / 동일한 task V02-007의 GitHub work status만 `continue`로 바꿨습니다.

기대 동작:

`Tab watcher = Watching` + `GitHub work status = needs_user` → GitHub만 같은 seq 5 `continue`로 변경 → watcher가 다음 poll에서 이를 감지 → Start 재클릭 없이 현재 owning tab에 표준 resume prompt 자동 전송

이 same-sequence terminal -> continue 전환은 일반 same-sequence retry가 아니라 새로운 work authorization으로 처리되어야 하므로 retry delay를 기다릴 필요가 없습니다.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 watcher Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | PAUSED | 최신 browser gates 이후 남은 safeguard 확인 |
| V02-006 persistent watcher | IN_PROGRESS | needs_user에서도 Watching 유지 확인; 같은 seq continue 자동 재개 관찰 중 |
| V02-007 단일 Start/Stop watcher | IN_PROGRESS | Start로 Watching 진입은 관찰; 명시적 Stop -> Start round-trip은 아직 남음 |
| V02-008 Rerun 연결 프롬프트 | PARTIAL | 현재 프로젝트 active-run 보존/reconciliation 경로 확인; 새 프로젝트 생성 경로는 별도 검증 필요 |

## 최근 확인된 것

- v0.2.4 Side Panel에서 GitHub `needs_user` 상태인데도 사용자가 watcher가 `Watching`이라고 직접 확인했습니다.
- 따라서 GitHub terminal 상태와 Chrome watcher 상태가 분리된 첫 browser 조건은 PASS evidence입니다.
- `docs/V02_E2E_RESULT.md`에 이 관찰을 기록했습니다.
- PLAN에서 V02-006을 `in_progress`로 전환했습니다.
- STATE와 control은 같은 seq 5 / V02-007을 유지하면서 work status만 `continue`로 전환했습니다.
- 사용자는 이 probe 동안 Start/Stop을 다시 누르지 않아야 합니다.

## 지금 사용자가 해야 할 것

아무 버튼도 누르지 말고 현재 탭을 그대로 둡니다.

자동으로 기존 Rerun resume prompt가 들어오면, watcher가 GitHub의 same-sequence terminal -> `continue` 전환을 감지해 자동 재개한 것입니다.

프롬프트가 들어오면 그 자동 실행 자체가 다음 증거를 기록하게 됩니다.

## 그 다음 자동 작업

- 자동 resume prompt가 도착하면 V02-006의 핵심 terminal -> continue 자동 재개 조건을 PASS evidence로 기록합니다.
- 이후 V02-007의 명시적 `Stop -> Start` 왕복을 확인합니다.
- 그 다음 V02-008 신규 프로젝트 onboarding과 남은 V02-005 safeguard를 정리합니다.

## Blockers / risks

- 현재 blocker 없음.
- watcher가 꺼지거나 탭이 닫히면 이 probe는 성립하지 않습니다.
- composer draft가 있거나 prompt 전송 안전 오류가 발생하면 watcher가 안전 정지할 수 있습니다.
- `STATUS.md`는 표시용 projection이며 자동화 판단에는 사용하지 않습니다.

## Freshness policy

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 갱신.
- 내용 변화가 없으면 시각만 바꾸기 위한 heartbeat commit은 만들지 않음.
- ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 빈 주기 갱신을 만들지 않음.

`control.json`은 마지막 authoritative state write입니다. STATUS는 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
