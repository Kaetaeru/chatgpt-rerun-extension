# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T15:20:00Z` (00:20 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `7` |
| GitHub work status | `needs_user` |
| Current task | `V02-008` |
| Extension version | `0.2.4` |
| Core runtime/browser dogfood | PASS |
| Formal project DoD | NOT YET COMPLETE |

## 현재 상태

v0.2.4의 핵심 런타임과 브라우저 UX는 실제 dogfood에서 모두 확인됐습니다.

- 탭별 설정/runtime 분리: PASS
- 동일 GitHub stream 중복 watcher 차단: PASS
- 새 sequence / same-sequence 자동 dispatch: PASS
- fresh-chat GitHub-backed handoff: PASS
- handoff race/failure 보호: PASS (실제 성공 경로 + 안전하게 재현 가능한 source 검증 범위)
- terminal GitHub work state에서도 watcher 유지: PASS
- 같은 sequence `needs_user -> continue` 자동 재개: PASS
- 단일 Start/Stop watcher 토글: PASS

방금 사용자가 V02-007의 마지막 수동 `Stop -> Start` 왕복도 정상이라고 확인했습니다.

## 남은 한 가지

V02-008의 **깨끗한 새 프로젝트 onboarding 경로**만 실제 관찰되지 않았습니다.

별도의 안전한 프로젝트에서, 그 ChatGPT 대화가 이미 어느 GitHub repository를 사용하는지 명확한 상태로:

1. watcher Stopped
2. `Rerun 연결 프롬프트` 클릭
3. 올바른 repo/branch 식별
4. `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, `control.json` 생성/보완
5. 새 프로젝트라면 control을 마지막 authoritative write로 sequence 0 / `continue` 게시
6. 연결 turn은 구현을 시작하지 않고 종료
7. 이후 Start가 watcher를 켜고 첫 task를 시작

을 확인하면 V02-008을 닫을 수 있습니다.

현재 프로젝트에서 연결 프롬프트가 **기존 active run을 보존하고 reconcile하는 경로**는 이미 정상 확인됐습니다. 남은 것은 최초 생성 경로뿐입니다.

## 테스트 주의사항

- 이 저장소의 기존 `.chatgpt-rerun` 파일을 삭제하거나 초기화해서 테스트하지 않습니다.
- 완전히 별도의 안전한 project/repository를 사용해야 합니다.
- 최신 전체 `npm run check` / `npm test`는 현재 작업 환경이 `github.com`을 resolve하지 못해 다시 실행하지 못했습니다. 이전 targeted checks와 live browser evidence는 있으나, 이 항목은 PASS로 과장하지 않습니다.

## 사용자 관점 결론

**일상적으로 사용할 핵심 기능은 완성 상태에 가깝고 실제로 동작합니다.** 다만 이 프로젝트가 스스로 정의한 공식 Definition of Done을 `complete`로 게시하려면 V02-008 새 프로젝트 최초 연결 E2E 한 건이 더 필요합니다.

## Freshness policy

- 의미 있는 상태/task/검증 변화가 있으면 즉시 갱신.
- 긴 active 실행은 약 5분 freshness를 목표로 안전한 체크포인트에서 갱신.
- 내용 변화가 없으면 빈 heartbeat 커밋은 만들지 않음.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.