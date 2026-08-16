# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T23:25:00Z` (08:25 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.12` |
| Actual failing project | `Kaetaeru/SimpleVTT @ main` |
| SimpleVTT control | `sequence 1 · continue` |
| Browser verification | PENDING v0.2.12 RELOAD |

## 이번에 확인된 실제 원인

SimpleVTT는 정상적으로 `continue`였지만 Rerun의 별도 lifetime `Max sends=20` 안전장치가 먼저 실행을 막고 있었습니다. Phase 14처럼 하나의 run에서 20회 이상 deliberate continuation을 수행하면 watcher는 계속 `Watching` / `Public · rate-safe`로 보이면서 내부적으로 `max_runs` 대기 상태가 될 수 있었습니다.

## v0.2.12 수정

- workflow 전체의 lifetime `Max sends` 제한 제거
- normal dispatch의 `max_runs` 차단 제거
- `CLAIM_SEQUENCE`의 `max_runs` 차단 제거
- fresh-chat handoff의 `Max sends` 거부 제거
- Side Panel에서 `Max sends` 설정 제거
- `Sent` 숫자는 진단 통계로만 유지
- 동일한 control generation 반복은 기존 `Retries / sequence`로 계속 제한
- 기존 저장소에 남은 `maxRuns=20/100` 값은 실행을 막지 않음

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.12 Reload**
2. 기존 SimpleVTT ChatGPT 탭으로 돌아감
3. 연결이 `Kaetaeru/SimpleVTT @ main`인지 확인
4. watcher를 Watching으로 유지/Start
5. SimpleVTT의 sequence 1은 변경하지 않음
6. 다음 successful poll에서 resume prompt가 자동 제출되는지 확인
7. `Sent`가 20 이상이어도 실행되어야 함
8. 현재 대화가 exhausted라면 fresh-chat handoff도 `Sent` 수와 무관하게 진행되어야 함

## 검증 한계

- v0.2.12 remote source/regression assertions는 커밋됨
- container는 github.com DNS를 resolve하지 못해 exact latest checkout의 전체 `npm test` / `npm run check`는 실행하지 못함
- 실제 SimpleVTT browser dispatch는 v0.2.12 Reload 후 사용자 관찰 필요

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
