# ChatGPT Rerun Live Status

> 사람용 현황판입니다. 자동 reconciliation의 source of truth는 README / PLAN / STATE / control입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-25T19:56:36Z` (`2026-08-26 04:56:36 KST`) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | **0.2.16** |
| Dogfood target | `Kaetaeru/SimpleVTT @ work/v1-composite` |
| Browser verification | PENDING RELOAD |

## v0.2.16 — 정상 응답 종료 즉시 다음 실행

원래 Rerun UX를 복구했습니다.

```text
Rerun prompt
-> ChatGPT 정상 응답 종료
-> 다음 content tick에서 GitHub control 즉시 1회 refresh
-> continue면 다음 prompt 즉시 자동 제출
```

이 경로에서는 일반 public polling 간격이나 `retryDelaySeconds`를 기다리지 않습니다.

안전 경계는 유지합니다.

- terminal `complete` / `needs_user` / `blocked`: 다음 구현 prompt를 보내지 않음, watcher는 Watching 유지
- sequence regression: 차단
- 사용자 직접 Stop: 정상 completion으로 보지 않아 즉시 auto-chain하지 않음
- 23분 watchdog Stop: 정상 completion이 아니라 re-armed recovery 경로 사용
- GitHub server-side rate-limit pause: 우회하지 않음
- completion refresh는 1회만 소비하여 API 오류 시 2초 hammer loop 방지
- normal continuation은 `pendingIsRetry=false`라 retry budget을 소비하지 않음

## 기존 보호 유지

- lifetime `Max sends` 없음
- same-sequence fresh `updated_at` authorization 지원
- abnormal unchanged-generation retry 보호 유지
- watchdog 강제종료 전 retry/pending re-arm
- GitHub 승인 대기 중 Rerun retry 억제, 승인 자체는 수동
- fresh-chat ownership handoff와 user draft 보호 유지

## 검증 상태

- v0.2.16 product source: COMMITTED / SOURCE-VERIFIED
- source regression assertions: COMMITTED
- approval-detector test regex correction: targeted Node probe PASS (`true`)
- exact latest full `npm run check` / `npm test`: NOT_RUN — 현재 실행 환경에서 `github.com` DNS 해석 실패로 exact checkout 불가
- live normal-completion chaining: PENDING

## 지금 확인할 것

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.16 Reload**
2. 연결된 탭에서 watcher를 `Watching`으로 유지
3. Rerun 응답 하나를 정상적으로 끝까지 두기
4. 응답 종료 뒤 90/120초 기다리지 않고 다음 prompt가 거의 바로 자동 제출되는지 확인
5. 직접 Stop을 눌렀을 때는 즉시 재시작하지 않는지 확인

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
