# ChatGPT Rerun Live Status

> 사람용 현황판입니다. 자동 reconciliation의 source of truth는 README / PLAN / STATE / control입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-25T20:11:45Z` (`2026-08-26 05:11:45 KST`) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | **0.2.17** |
| Dogfood target | `Kaetaeru/SimpleVTT @ work/v1-composite` |
| Browser verification | PENDING RELOAD |

## v0.2.17 — 정상 완료면 Same-sequence retries 즉시 0

v0.2.16의 즉시 chaining은 유지하면서 retry 상태 의미를 바로잡았습니다.

```text
Rerun prompt
-> ChatGPT 정상 응답 종료
-> Same-sequence retries = 0/N 즉시 초기화
-> GitHub control 즉시 1회 refresh
-> continue면 다음 prompt 즉시 자동 제출
```

정상 실행이 성공했다면 이전 abnormal retry 이력은 더 이상 unresolved 상태가 아니므로 다음 prompt ACK까지 남겨두지 않습니다. refreshed control이 `complete`, `needs_user`, `blocked`라 다음 prompt가 없어도 counter는 이미 0이어야 합니다.

안전 경계는 유지합니다.

- `Sent` / `runCount`: 정상 완료로 초기화하지 않음; lifetime telemetry 유지
- terminal `complete` / `needs_user` / `blocked`: 다음 구현 prompt를 보내지 않음, watcher는 Watching 유지
- sequence regression: 차단
- 사용자 직접 Stop: 정상 completion으로 보지 않음
- 23분 watchdog Stop: 별도 recovery re-arm 경로 사용
- GitHub server-side rate-limit pause: 우회하지 않음
- completion refresh는 1회만 소비하여 API 오류 시 2초 hammer loop 방지
- normal continuation은 `pendingIsRetry=false`라 이후 ACK도 retry counter를 0으로 유지

## 기존 보호 유지

- lifetime `Max sends` 없음
- same-sequence fresh `updated_at` authorization 지원
- abnormal unchanged-generation retry 보호 유지
- watchdog 강제종료 전 retry/pending re-arm
- GitHub 승인 대기 중 Rerun retry 억제, 승인 자체는 수동
- fresh-chat ownership handoff와 user draft 보호 유지

## 검증 상태

- v0.2.17 product source: COMMITTED / SOURCE-VERIFIED
- v0.2.17 retry-reset source assertion: COMMITTED
- exact latest full `npm run check` / `npm test`: NOT_RUN — 현재 실행 환경에서 GitHub DNS 해석 실패로 exact checkout 불가
- live `Same-sequence retries -> 0/N`: PENDING
- live immediate normal-completion chaining: PENDING

## 지금 확인할 것

1. 최신 branch를 pull한 뒤 `chrome://extensions`에서 ChatGPT Rerun **v0.2.17 Reload**
2. 연결된 탭에서 watcher를 `Watching`으로 유지
3. Rerun 응답 하나를 정상적으로 끝까지 두기
4. 응답이 정상 종료되는 순간 `Same-sequence retries`가 **`0/N`**으로 초기화되는지 확인
5. `continue`라면 이어서 90/120초 기다리지 않고 다음 prompt가 거의 바로 자동 제출되는지 확인
6. 직접 Stop을 눌렀을 때는 정상 성공으로 초기화/즉시 chaining되지 않는지 확인

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
