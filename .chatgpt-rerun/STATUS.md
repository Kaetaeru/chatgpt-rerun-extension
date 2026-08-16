# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T18:40:00Z` (03:40 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.10` |
| Previous V02-001~008 | PASS |
| Latest blocker | GitHub public REST rate limit during Start |
| Browser verification | PENDING RELOAD |

## 이번 rate-limit 문제

사용자가 Start를 시도했을 때 `GitHub API rate limit reached; wait for reset or use a token`이 표시됐습니다.

기존 비인증 polling 최소값은 60초였습니다. GitHub public REST 기본 한도도 60 requests/hour이므로, watcher 하나만 계속 돌아도 여유가 없고 Start 시 즉시 fetch, 추가 stream, 다른 API 요청이 합쳐지면 쉽게 quota를 넘을 수 있었습니다.

## v0.2.10 변경

- token 없는 watcher 1개: effective polling 최소 90초
- token 없는 watcher 여러 개: 최소 polling을 `90초 × enabled unauthenticated watcher 수`로 자동 확장
- token 있음: 기존 최소 5초 유지
- GitHub 403/429 rate limit은 오류/Stop이 아니라 `rateLimitPausedUntil` 대기 상태로 처리
- Start 시 이미 quota가 exhausted여도 watcher는 `Watching`으로 유지
- reset/retry 시각이 지나면 Start를 다시 누르지 않고 자동 polling 재개
- Side Panel의 `Rate remaining` 숫자 제거
- 대신 `API polling`에 다음 중 하나 표시:
  - `Public · rate-safe`
  - `Authenticated · conditional`
  - `Paused until ...`
- extension REST polling이 잠시 멈춰도 cached control/runtime 정보가 있으면 fresh-chat handoff를 불필요하게 막지 않음

## 중요한 의미

GitHub 서버의 rate limit 자체를 없애는 것은 불가능합니다. 하지만 Rerun 입장에서는 그 제한이 **watcher 종료나 수동 Start 반복으로 이어지지 않게** 만들었습니다.

빠르고 사실상 지속적인 polling이 필요하면 GitHub token을 넣는 것이 권장됩니다. 인증된 REST 요청은 일반적으로 더 큰 quota를 가지며, correctly authorized ETag conditional request가 `304 Not Modified`이면 primary rate quota를 소비하지 않습니다.

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.10 Reload**
2. 같은 연결 탭에서 Start
3. quota가 아직 exhausted라면:
   - `Tab watcher = Watching`
   - 버튼 = `Stop`
   - `API polling = Paused until ...`
   - 빨간 rate-limit 오류 없음
4. quota가 이미 reset됐다면 token 없이 `API polling = Public · rate-safe` 확인
5. 그 다음 기존 exhausted-chat fresh handoff 테스트 계속 진행

## 현재 검증 한계

- v0.2.10 source와 regression tests는 GitHub에 반영됨
- GitHub Actions workflow는 없음
- 현재 실행 환경에서 최신 branch 전체 checkout을 materialize하지 못해 exact full npm suite는 아직 NOT_RUN
- 실제 Chrome rate-limit pause/resume과 exhausted-chat handoff는 Reload 후 browser evidence 필요

## Freshness policy

의미 있는 상태/task/검증 변화가 있으면 즉시 갱신합니다. 내용이 동일하면 시각만 바꾸는 heartbeat commit은 만들지 않습니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
