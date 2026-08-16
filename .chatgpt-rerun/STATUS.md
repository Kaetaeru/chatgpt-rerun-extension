# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T16:05:00Z` (01:05 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `8` |
| GitHub work status | `complete` |
| Final task | `V02-008` |
| Extension version | `0.2.5` |
| Browser E2E | V02-001~008 PASS |
| `npm run check` | PASS |
| `npm test` | PASS — 38/38 |
| Formal project DoD | COMPLETE |

## 완료 상태

ChatGPT Rerun v0.2.5 dogfood run이 완료됐습니다.

마지막 남은 V02-008 신규 프로젝트 온보딩도 사용자가 요청된 최종 절차를 수행한 뒤 `다 됐어.`라고 확인했습니다. 따라서 신규 탭의 unconnected-first 연결 흐름까지 browser acceptance가 완료됐습니다.

최신 branch의 정확한 GitHub blobs로 임시 checkout을 구성해 전체 검증도 다시 수행했습니다.

- `npm run check`: PASS
- `npm test`: 38 passed / 0 failed
- `manifest.json` parse: PASS
- `package.json` parse: PASS

첫 전체 테스트에서 오래된 regression assertion 한 건이 현재 `content.js` 구현 문법과 맞지 않아 실패했습니다. 제품 기능 실패가 아니라 테스트가 `RERUN_CONNECT` 추가 전의 조건문 형태를 기대하던 문제였습니다. `tests/bootstrap-flow.test.mjs`를 현재 세 direct-prompt 메시지 계약에 맞게 수정한 뒤 전체 suite가 38/38 PASS했습니다.

## Final progress

| Task | Result | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 탭별 설정/runtime 독립 |
| V02-002 동일 stream 충돌 차단 | PASS | 중복 watcher 방지 |
| V02-003 dispatch/retry | PASS | 새 sequence와 제한적 retry 정상 |
| V02-004 새 채팅 이어가기 | PASS | GitHub 상태 기반 handoff 정상 |
| V02-005 handoff 보호 | PASS | race/failure cleanup 경로 검증 |
| V02-006 persistent watcher | PASS | terminal에서도 Watching, 이후 continue 자동 재개 |
| V02-007 Start/Stop watcher | PASS | 단일 버튼 왕복 정상 |
| V02-008 신규 연결 | PASS | Unconnected-first 신규 프로젝트 온보딩 정상 |

## 현재 동작 의미

GitHub control은 `complete`입니다. 이것은 **현재 dogfood 작업이 완료됐다는 뜻**이며 Chrome watcher를 강제로 끄는 신호가 아닙니다.

현재 탭 watcher가 여전히 Watching이라면 설정된 주기로 GitHub를 계속 확인할 수 있습니다. 미래에 이 run 또는 새로운 유효 control이 `continue`로 게시되면 watcher 정책에 따라 다시 평가할 수 있습니다.

## Blockers / risks

- 현재 blocker 없음.
- PR #1은 사용자 요청 없이 merge하지 않습니다.
- 이후 코드가 변경되면 해당 변경이 영향을 주는 acceptance evidence는 다시 검증해야 합니다.

## Freshness policy

완료 상태에서 실제 진행이 없으면 시각만 갱신하는 heartbeat commit은 만들지 않습니다. 향후 상태나 작업이 의미 있게 바뀌면 STATUS를 다시 갱신합니다.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
