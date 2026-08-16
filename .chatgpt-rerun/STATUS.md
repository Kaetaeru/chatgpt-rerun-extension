# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T15:42:00Z` (00:42 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `7` |
| GitHub work status | `needs_user` |
| Current task | `V02-008` |
| Extension version to verify | `0.2.5` |
| V02-001~007 | PASS |
| Formal project DoD | FINAL ONBOARDING PROBE REMAINS |

## 이번 변경

신규 프로젝트 연결 의미를 더 엄격하게 바꿨습니다.

새 ChatGPT 탭은 이제 다른 탭이나 예전 legacy 설정에서 repository 좌표를 자동 상속하지 않습니다. Side Panel은 **`Repository connection = Unconnected`**로 시작하고 Owner / Repository / Branch는 연결 결과를 받기 전까지 연결된 것으로 취급하지 않습니다.

`Rerun 연결 프롬프트`도 Side Panel 좌표를 힌트로 사용하지 않습니다. 현재 채팅이 GitHub 앱/도구로 **실제로 사용한 repository**만 조사합니다.

- 실제 GitHub repo 사용 없음 → `RERUN_CONNECTION: UNCONNECTED`, 아무 파일도 쓰지 않음
- repo/branch 후보가 여러 개 또는 불명확 → `RERUN_CONNECTION: AMBIGUOUS`, 아무 파일도 쓰지 않음
- 하나의 실제 repo/branch로 확정 → 5개 Rerun 문서를 설치/보완하고 `RERUN_CONNECTION: CONNECTED` 보고

CONNECTED 결과에는 사용자가 Side Panel 연결을 직접 확인할 수 있도록 다음을 모두 보여줍니다: owner/repo, canonical GitHub URL, 정확한 branch/ref, control path, 새 생성/reconcile 여부, run_id, sequence, status, task_id, 프로젝트 목표.

확장프로그램은 assistant 답변을 DOM 파싱해 이 값을 몰래 가져오지 않습니다. 사용자가 CONNECTED 결과를 확인한 뒤 Owner / Repository / Branch를 Side Panel에 저장하고 Start합니다.

## V02-008 최종 테스트

v0.2.5 Reload 후 별도 안전한 테스트 프로젝트에서 다음 순서로 검증합니다.

1. **새 ChatGPT 탭**을 열고 Side Panel이 `Unconnected`이며 이전 repo 좌표가 상속되지 않았는지 확인.
2. 이 채팅에서 아직 어떤 GitHub repo도 실제로 사용하지 않은 채 `Rerun 연결 프롬프트`를 누름.
3. `RERUN_CONNECTION: UNCONNECTED`가 나오고 GitHub에 아무 Rerun 파일도 생성되지 않는지 확인.
4. 같은 채팅에서 안전한 test repo를 GitHub 앱으로 실제 읽음.
5. 다시 `Rerun 연결 프롬프트`를 누름.
6. `RERUN_CONNECTION: CONNECTED`와 완전한 연결 정보가 나오고 README/PLAN/STATE/STATUS/control 5문서가 생성되는지 확인.
7. 연결 prompt 자체는 실제 구현을 시작하지 않고 종료하는지 확인.
8. CONNECTED 결과의 Owner / Repository / Branch를 Side Panel에 저장.
9. Start → Watching → seq 0 / continue가 첫 task를 자동 시작하는지 확인.

이 경로가 PASS하면 현재 프로젝트의 마지막 브라우저 acceptance item인 V02-008을 닫을 수 있습니다.

## 현재까지 검증 완료

- V02-001 탭별 세션 분리: PASS
- V02-002 동일 stream 충돌 차단: PASS
- V02-003 dispatch/retry: PASS
- V02-004 fresh-chat handoff: PASS
- V02-005 handoff race/failure safeguards: PASS to safely reproducible scope
- V02-006 persistent watcher + terminal -> continue auto-resume: PASS
- V02-007 단일 Start/Stop watcher: PASS
- V02-008: v0.2.5 unconnected-first path는 아직 브라우저에서 NOT_RUN

## 검증 제한

최신 전체 checkout의 `npm run check` / `npm test`는 현재 실행 환경의 GitHub 네트워크 제한 때문에 다시 실행하지 못했습니다. v0.2.5 source와 regression test files는 branch에 반영되어 있지만 full suite PASS라고 기록하지 않습니다.

## 지금 사용자가 해야 할 것

`chrome://extensions`에서 최신 `agent/mvp-autoresume` **v0.2.5**를 Reload한 뒤 새 ChatGPT 탭을 열어 V02-008의 첫 단계인 **진짜 Unconnected** 상태부터 확인합니다.

## Freshness policy

- 의미 있는 상태/task/검증 변화가 있으면 즉시 갱신.
- 긴 active 실행은 약 5분 freshness를 목표로 안전한 체크포인트에서 갱신.
- 내용 변화가 없으면 빈 heartbeat 커밋은 만들지 않음.

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.