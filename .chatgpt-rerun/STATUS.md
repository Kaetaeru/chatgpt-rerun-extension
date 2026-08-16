# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T15:18:00Z` (00:18 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `6` |
| GitHub work status | `needs_user` |
| Current task | `V02-007` |
| Activity | Waiting for manual Stop -> Start watcher round-trip |
| Extension version | `0.2.4` |
| Overall dogfood | IN_PROGRESS |

## 방금 확인된 핵심 동작

**V02-006 persistent watcher가 PASS했습니다.**

1. GitHub가 seq 5 / `needs_user`인 동안 사용자가 Side Panel에서 `Tab watcher = Watching`을 직접 확인했습니다.
2. Start를 다시 누르지 않은 채 GitHub만 같은 seq 5 / `continue`로 바꿨습니다.
3. 현재 탭에 표준 Rerun resume prompt가 자동으로 도착했습니다.

따라서 Chrome watcher와 GitHub work state가 실제 브라우저에서도 분리되어 있습니다. GitHub terminal 상태는 작업 dispatch만 멈추고 watcher를 끄지 않으며, 이후 `continue`가 오면 watcher 재-Start 없이 자동 재개합니다.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 watcher Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | PAUSED | 최신 browser gates 이후 남은 safeguard 확인 |
| V02-006 persistent watcher | PASS | `needs_user`에서도 Watching 유지 + 같은 seq `continue` 자동 재개 확인 |
| V02-007 단일 Start/Stop watcher | IN_PROGRESS | Start -> Watching 확인 완료; Stop -> Start 왕복만 남음 |
| V02-008 Rerun 연결 프롬프트 | PARTIAL | 현재 프로젝트 active-run 보존/reconciliation 경로 확인; 새 프로젝트 생성 경로는 별도 검증 필요 |

## 지금 사용자가 해야 할 것

GitHub work state는 seq 6 / `needs_user`로 대기 중이므로 자동 구현 프롬프트가 새로 나가면 안 됩니다.

현재 Side Panel에서:

1. **Stop** 클릭
2. `Tab watcher = Stopped`인지 확인
3. 같은 버튼이 **Start**로 바뀌는지 확인
4. **Start** 클릭
5. `Tab watcher = Watching`인지 확인
6. 같은 버튼이 **Stop**으로 바뀌는지 확인
7. `GitHub work status = needs_user`가 별도 행으로 그대로인지 확인

이 왕복이 정상이라면 V02-007을 닫을 수 있습니다.

## 그 다음 자동 작업

V02-007 완료 후 V02-008의 별도 새 프로젝트 onboarding 검증과 남은 V02-005 safeguard를 정리합니다.

## Blockers / risks

- 현재 blocker는 V02-007의 짧은 수동 UI 확인뿐입니다.
- `STATUS.md`는 표시용 projection이며 자동화 판단에는 사용하지 않습니다.

## Freshness policy

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 갱신.
- 내용 변화가 없으면 시각만 바꾸기 위한 heartbeat commit은 만들지 않음.

`control.json`은 마지막 authoritative state write입니다. STATUS는 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
