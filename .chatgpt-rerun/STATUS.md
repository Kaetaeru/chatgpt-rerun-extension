# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T14:39:00Z` (23:39 KST) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `5` |
| Control status | `needs_user` |
| Current task | `V02-007` |
| Activity | Waiting for user Reload |
| Extension version to verify | `0.2.2` |
| Overall dogfood | IN_PROGRESS |

## 지금 무슨 일이 진행 중인가

최신 v0.2.2에는 두 가지 새 동작이 함께 들어가 있습니다.

1. Side Panel의 실행 제어는 별도 Start/Stop 버튼이 아니라 하나의 상태 기반 버튼입니다: `Stopped -> Start`, `Running -> Stop`, Stop 후 다시 `Start`.
2. 다른 GitHub 저장소에서 기본 `.chatgpt-rerun/control.json`이 없더라도 사용자가 미리 상태 파일을 만들 필요가 없습니다. Start가 먼저 안전한 repository bootstrap을 실행하고, 표준 상태가 준비되면 일반 Rerun을 자동 시작합니다.

현재 코드는 반영됐지만 로컬 Chrome은 새 build를 Reload해야 하므로 자동 실행은 `needs_user`로 정지되어 있습니다.

## 새 저장소에서 Start하면

대상 repo/branch가 현재 확장프로그램 GitHub read 인증으로 실제 접근 가능하고 control path가 기본값일 때만:

`Start` → `Initializing repository` → ChatGPT bootstrap prompt 1회 → `.chatgpt-rerun/README.md` / `PLAN.md` / `STATE.md` / `STATUS.md` 생성·보완 → `control.json` 마지막 게시 → bootstrap turn 종료 → 확장프로그램이 control 감지 → 일반 resume prompt → 첫 task 시작

안전 경계:

- custom missing control path는 자동 생성하지 않음.
- 접근할 수 없거나 존재하지 않는 repo/branch를 빈 프로젝트로 오인하지 않음.
- 일부 Rerun 파일이 이미 있으면 무조건 덮어쓰지 않고 호환 가능한 누락 부분만 보완하도록 ChatGPT에 지시함.
- Chrome extension token은 계속 read 용도이며, 실제 파일 쓰기는 연결된 ChatGPT GitHub 앱이 수행함.
- bootstrap 중 normal sequence claim과 new-chat handoff를 억제함.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | PAUSED | 최신 browser gates 이후 재개 |
| V02-006 terminal isolation | PENDING | terminal 상태가 owning tab만 멈추는지 남음 |
| V02-007 단일 Start/Stop 토글 | IN_PROGRESS | 코드/기존 정적 검증 있음, v0.2.2 Reload 후 실제 Chrome 확인 필요 |
| V02-008 새 저장소 자동 bootstrap | PENDING | v0.2.2 Reload 후 별도 안전한 테스트 repo에서 확인 필요 |

## 최근 확인된 것

- manifest/package 버전이 `0.2.2`로 올라감.
- `control.js`의 실제 업데이트된 bootstrap helper를 Node로 검사: 기본 control path 허용, custom path 거부, README/PLAN/STATE/STATUS/control 5파일 요구, control-last, bootstrap turn 종료 규칙 PASS.
- Start 경로는 missing control을 곧바로 초기화하지 않고 repo/branch 접근 가능성을 별도로 확인함.
- `bootstrapPending` 동안 동일 stream ownership을 유지하고 normal sequence claim을 막음.
- `content.js`는 assistant 출력 내용을 읽지 않고 직접 bootstrap prompt만 전송함.
- `tests/control.test.mjs`, `tests/bootstrap-flow.test.mjs`가 새 bootstrap 회귀 조건을 포함함.
- 전체 최신 checkout `npm run check` / `npm test`는 현재 container가 github.com을 resolve하지 못해 아직 실행하지 못했으며 PASS로 기록하지 않음.

## 지금 사용자가 해야 할 것

`chrome://extensions`에서 ChatGPT Rerun unpacked extension을 최신 `agent/mvp-autoresume`의 **v0.2.2**로 Reload합니다.

Reload 후 먼저 현재 탭에서:

`Stopped + Start` → Start 클릭 → `Running + Stop` → Stop 클릭 → `Stopped + Start`

을 확인하면 V02-007을 닫을 수 있습니다.

그 다음 V02-008은 **별도 안전한 GitHub 테스트 저장소/branch**에서 확인합니다. 그 저장소에는 `.chatgpt-rerun/control.json`이 없어야 하지만 저장소 자체를 확장프로그램이 읽을 수 있어야 합니다. 실제 프로젝트의 상태 파일을 삭제해서 테스트하지 않습니다.

## 그 다음 자동 작업

V02-007과 V02-008이 확인되면 현재 `needs_user` gate를 해제하고, 미완료 V02-005 handoff safeguard와 V02-006 terminal isolation 검증을 재개합니다.

## Blockers / risks

- 현재 blocker는 코드 문제가 아니라 **로컬 Chrome의 unpacked extension v0.2.2 Reload 필요**입니다.
- V02-008에는 별도 안전한 테스트 repo/branch가 필요합니다.
- ChatGPT GitHub 앱에 대상 저장소 쓰기 권한이 없다면 bootstrap은 파일을 게시할 수 없습니다. 확장프로그램이 승인 UI를 대신 누르거나 권한을 우회하지 않습니다.
- `STATUS.md` 자체는 표시용 projection이므로 stale할 수 있으며 자동화 판단에는 사용하지 않습니다.

## Freshness policy

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 갱신.
- 내용 변화가 없으면 시각만 바꾸기 위한 heartbeat commit은 만들지 않음.
- ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 빈 주기 갱신을 만들지 않음.

`control.json`은 마지막 **authoritative** state write입니다. STATUS는 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
