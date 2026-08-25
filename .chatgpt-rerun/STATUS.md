# ChatGPT Rerun Live Status

> 사람용 현황판입니다. 자동 reconciliation의 source of truth는 README / PLAN / STATE / control입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-25T21:17:00Z` (`2026-08-26 06:17:00 KST`) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | **0.2.18** |
| Dogfood target | `Kaetaeru/SimpleVTT @ work/v1-composite` |
| Browser verification | PENDING RELOAD |

## v0.2.18 — 현재 대화가 소진되면 새 대화로 handoff

확인된 문제는 새 탭 ownership 코드 자체가 아니라, 현재 대화에서 composer를 못 찾았을 때 `content.js`가 그냥 `return`해 버리는 분기였습니다.

```text
GitHub continue
-> 현재 ChatGPT idle
-> composer 없음
-> 이전: 아무 것도 안 하고 계속 Watching
-> v0.2.18: 최대 5초 렌더링 대기
-> 여전히 composer 없음
-> 기존 HANDOFF_NEW_CHAT 재사용
-> 새 ChatGPT 탭 1개 생성 + watcher ownership 이전 + handoff prompt 자동 제출
```

안전 경계는 유지합니다.

- composer가 잠깐 늦게 렌더링되는 경우를 위해 5초 먼저 기다림
- 기존 fresh-chat handoff만 재사용; 별도 두 번째 handoff 시스템 없음
- direct handoff 실패 시 재귀적으로 새 탭을 계속 열지 않고 safe-stop
- 사용자 draft 보호 유지
- 정상 완료 즉시 chaining 유지
- 정상 완료 시 Same-sequence retries 즉시 `0/N` 유지
- 23분 watchdog / GitHub 승인 대기 / rate-limit 보호 유지

## 검증 상태

- v0.2.18 product source: COMMITTED / SOURCE-VERIFIED
- missing-composer regression assertion: COMMITTED / SOURCE-VERIFIED
- manifest/package: `0.2.18`
- exact latest full `npm run check` / `npm test`: NOT_RUN — 컨테이너가 `raw.githubusercontent.com` DNS를 해석하지 못해 checkout 전에 실패
- live fresh-chat recovery: PENDING

## 지금 확인할 것

1. 최신 `agent/mvp-autoresume`을 pull
2. `chrome://extensions`에서 ChatGPT Rerun **v0.2.18 Reload**
3. 기존 SimpleVTT ChatGPT 탭도 **F5 새로고침**
4. watcher가 `Watching`인지 확인
5. 현재 대화가 더 이상 입력 가능한 composer를 제공하지 않는 상황에서 최대 5초 뒤 새 ChatGPT 탭 하나가 열리는지 확인
6. 새 탭에 GitHub-backed handoff prompt가 자동 제출되고 watcher ownership이 새 탭으로 넘어가는지 확인

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
