# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T14:59:00Z` (23:59 KST) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `5` |
| Control status | `needs_user` |
| Current task | `V02-007` |
| Activity | Rerun connection reconciled; waiting for user Reload |
| Extension version to verify | `0.2.3` |
| Overall dogfood | IN_PROGRESS |

## 지금 무슨 일이 진행 중인가

v0.2.3의 **Rerun 연결 프롬프트**가 현재 프로젝트 대화에서 실제로 전송됐고, 연결 대상은 이 대화에서 계속 작업해 온 `Kaetaeru/chatgpt-rerun-extension` / `agent/mvp-autoresume`로 확인됐습니다.

저장소에는 이미 `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, `control.json`이 있고 active run도 존재했습니다. 따라서 새 run을 만들거나 기존 `run_id`, sequence, task, 검증 기록을 초기화하지 않았습니다. control과 STATE를 reconcile한 결과 `chatgpt-rerun-v02-20260816-01 / seq 5 / needs_user / V02-007`로 Normal 상태였습니다.

현재 Rerun 5문서는 필요한 핵심 규칙을 이미 갖추고 있어 authoritative 문서 재작성이나 control 재게시가 필요하지 않았습니다. 이번 연결 실행은 실제 구현 task를 시작하지 않고 여기서 종료합니다.

권장 새 프로젝트 흐름은 그대로입니다:

`프로젝트 repo가 이미 연결된 ChatGPT 대화` → `Rerun 연결 프롬프트` → `.chatgpt-rerun/README.md / PLAN.md / STATE.md / STATUS.md / control.json` 생성·보완 → 연결 prompt 종료 → Side Panel repo 좌표 확인 → `Start` → 첫 task 실행

## 연결 프롬프트 안전장치

- Owner/Repository 입력칸은 repo 식별의 필수 조건이 아니라 선택적 힌트입니다.
- 현재 대화의 GitHub 맥락에서 repo/branch가 명확하면 그 대상을 사용합니다.
- repo 후보가 둘 이상이거나 확신이 없으면 아무 파일도 쓰지 않고 사용자에게 확인합니다.
- 기존 `.chatgpt-rerun` active run이 있으면 run_id / sequence / task / verification 기록을 초기화하거나 덮어쓰지 않습니다.
- 새 프로젝트에서는 실제 프로젝트 목표를 PLAN/STATE에 반영하고 control을 마지막 authoritative write로 sequence 0 / `continue` 게시합니다.
- STATUS는 사람용 projection으로 유지합니다.
- 연결 프롬프트 자체에서는 실제 구현 task를 시작하지 않습니다. 실제 Rerun은 이후 Start가 시작합니다.
- Rerun이 Running인 동안에는 연결 프롬프트 버튼이 비활성화됩니다.
- v0.2.2의 Start 자동 bootstrap은 연결 프롬프트를 건너뛴 경우의 fallback으로만 유지됩니다.

## Progress

| Task | Status | 사용자 관점 요약 |
|---|---|---|
| V02-001 탭별 세션 분리 | PASS | 각 ChatGPT 탭이 독립 설정/runtime을 유지함 |
| V02-002 동일 GitHub stream 충돌 차단 | PASS | 두 번째 탭의 중복 Start가 거부됨 |
| V02-003 자동 dispatch/retry 회귀 | PASS | 새 sequence와 same-sequence retry가 owning tab에서 정상 동작함 |
| V02-004 새 채팅 이어가기 | PASS | `Continue in new chat`으로 GitHub 상태 기반 handoff 성공 |
| V02-005 handoff race/failure 보호 | PAUSED | 최신 browser gates 이후 재개 |
| V02-006 terminal isolation | PENDING | terminal 상태가 owning tab만 멈추는지 남음 |
| V02-007 단일 Start/Stop 토글 | IN_PROGRESS | v0.2.3 Reload 후 실제 Chrome 확인 필요 |
| V02-008 Rerun 연결 프롬프트 | PENDING | 현재 프로젝트에서 active-run 보존/reconciliation 경로는 확인; 새 프로젝트 5파일 생성 경로는 별도 안전한 프로젝트에서 검증 필요 |

## 최근 확인된 것

- 현재 연결 프롬프트의 Side Panel 좌표와 실제 작업 저장소가 `Kaetaeru/chatgpt-rerun-extension` / `agent/mvp-autoresume`로 일치했습니다.
- 루트 `AGENTS.md`와 `CONTRIBUTING.md`는 존재하지 않고, 프로젝트 `README.md`를 지침으로 확인했습니다.
- `.chatgpt-rerun/README.md -> control.json -> STATE.md -> PLAN.md -> STATUS.md` 순서로 다시 읽었습니다.
- control과 STATE의 run/sequence/status/task가 모두 일치하여 preflight는 Normal입니다.
- 기존 active run을 보존했으며 새 run_id/sequence/task를 만들거나 초기화하지 않았습니다.
- `manifest.json` / `package.json` 버전은 `0.2.3`입니다.
- `control.js`에 `buildRerunConnectionPrompt()`가 추가됐고 repo-context 식별, ambiguity refusal, 5-file setup, active-run preservation, control-last, stop-before-implementation 규칙이 들어 있습니다.
- Side Panel에 `Rerun 연결 프롬프트` 버튼이 추가됐습니다.
- `popup.js`는 Stopped 상태에서만 `RERUN_CONNECT`를 보내며 필요하면 content script를 먼저 주입합니다.
- `content.js`는 handoff/bootstrap과 같은 idle + empty-composer 안전 경로로 `RERUN_CONNECT`를 전송합니다.

## 지금 사용자가 해야 할 것

`chrome://extensions`에서 ChatGPT Rerun unpacked extension을 최신 `agent/mvp-autoresume`의 **v0.2.3**으로 Reload합니다.

Reload 후 먼저 현재 탭에서:

`Stopped + Start` → Start 클릭 → `Running + Stop` → Stop 클릭 → `Stopped + Start`

을 확인하면 V02-007을 닫을 수 있습니다.

그 다음 별도 안전한 새 프로젝트 대화에서, 그 대화가 이미 GitHub repo를 알고 있는 상태로 `Rerun 연결 프롬프트`를 누릅니다. ChatGPT가 올바른 repo를 식별하고 5개 Rerun 문서를 생성/보완한 뒤 구현을 시작하지 않고 끝나는지 확인하면 V02-008의 신규 프로젝트 경로를 검증할 수 있습니다.

## 그 다음 자동 작업

V02-007과 V02-008이 확인되면 현재 `needs_user` gate를 해제하고, 미완료 V02-005 handoff safeguard와 V02-006 terminal isolation 검증을 재개합니다.

## Blockers / risks

- 현재 blocker는 코드 문제가 아니라 **로컬 Chrome의 unpacked extension v0.2.3 Reload 필요**입니다.
- V02-008의 신규 프로젝트 생성 경로에는 repo가 명확히 연결된 별도 안전한 프로젝트 대화가 필요합니다.
- ChatGPT GitHub 앱에 대상 저장소 쓰기 권한이 없다면 연결 프롬프트는 파일을 게시할 수 없습니다. 확장프로그램이 승인 UI를 대신 누르거나 권한을 우회하지 않습니다.
- `STATUS.md` 자체는 표시용 projection이므로 stale할 수 있으며 자동화 판단에는 사용하지 않습니다.

## Freshness policy

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신.
- 실행이 길게 이어지면 마지막 STATUS 갱신 후 약 5분을 목표로 다음 안전한 체크포인트에서 갱신.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 갱신.
- 내용 변화가 없으면 시각만 바꾸기 위한 heartbeat commit은 만들지 않음.
- ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 빈 주기 갱신을 만들지 않음.

`control.json`은 마지막 **authoritative** state write입니다. STATUS는 그 뒤에 갱신할 수 있는 presentation-only 파일이며, STATUS 쓰기 실패가 run/control 상태를 무효화하지 않습니다.
