# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T19:05:00Z` (04:05 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.11` |
| Actual failing project | `Kaetaeru/SimpleVTT @ main` |
| SimpleVTT control | `sequence 1 · continue` |
| Browser verification | PENDING v0.2.11 RELOAD |

## 실제 원인 — SimpleVTT

사용자가 `Public · rate-safe`인데 자동 작업이 시작되지 않았다고 보고한 대상은 Rerun 확장 저장소가 아니라 `Kaetaeru/SimpleVTT`였습니다.

SimpleVTT의 authoritative control/STATE/PLAN을 직접 확인한 결과 sequence 1 / `continue`가 정상적으로 게시되어 있고, 같은 sequence에서 Phase 14 장기 작업을 계속 이어가는 것이 의도된 프로토콜입니다.

v0.2.10의 문제는 `control.sequence === lastHandledSequence`이면 control이 새로 다시 쓰였는지 보지 않고 무조건 same-sequence retry로 취급했다는 점입니다. 기본 retry 2회가 소진된 뒤에는 `retry_limit`으로 계속 대기했기 때문에 Side Panel은 Watching / `Public · rate-safe`처럼 보여도 실제 prompt dispatch는 발생하지 않을 수 있었습니다.

## v0.2.11 수정

- 같은 sequence에서도 `control.updated_at`과 runtime `lastSentAt`을 비교
- `control.updated_at > lastSentAt`이면 새 실행 허가 generation으로 처리
- 새 generation은 `send · isRetry=false`로 dispatch하고 retry counter를 리셋
- 동일한 control generation이 계속 남아 있을 때만 retry delay/count 제한 적용
- stuck control의 무한 send 방지는 유지
- SimpleVTT처럼 한 task/sequence가 여러 ChatGPT 실행에 걸쳐 checkpoint -> continue로 이어지는 장기 workflow를 정상 지원

Targeted decision probe는 통과했습니다: retry count 2인 상태에서도 더 새로운 same-sequence `updated_at`은 fresh send가 되고, unchanged generation은 기존처럼 `retry_limit`이 유지됩니다.

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.11 Reload**
2. 기존 SimpleVTT ChatGPT 탭으로 돌아감
3. 연결이 `Kaetaeru/SimpleVTT @ main`인지 확인
4. watcher를 Watching으로 유지/Start
5. SimpleVTT의 sequence 1을 변경하지 않음
6. 다음 successful poll에서 현재 `continue` generation이 fresh authorization으로 분류되어 resume prompt가 자동 제출되는지 확인
7. 현재 채팅이 한도 도달 상태라면 이어서 fresh-chat handoff가 한 번만 발생하는지 확인

## 현재 검증 한계

- v0.2.11 remote source와 regression test 수정은 반영됨
- targeted decision logic은 실제 Node probe로 PASS
- 최신 exact branch 전체 npm suite는 이 환경의 github.com DNS 제한 때문에 NOT_RUN
- 실제 SimpleVTT browser dispatch는 v0.2.11 Reload 후 사용자 관찰 필요

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
