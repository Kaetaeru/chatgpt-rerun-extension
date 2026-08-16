# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `2026-08-16T23:51:00Z` (08:51 KST, Aug 17) |
| Run | `chatgpt-rerun-v02-20260816-01` |
| Sequence | `9` |
| GitHub work status | `needs_user` |
| Current task | `V02-009` |
| Extension version to verify | `0.2.13` |
| Live project | `Kaetaeru/SimpleVTT @ main` |
| SimpleVTT control | `sequence 1 · continue` |
| Browser verification | PENDING v0.2.13 RELOAD |

## v0.2.13 — GitHub 승인 후 자동 계속

Side Panel에 **GitHub 승인 후 자동 계속** 체크박스를 추가했습니다.

이 옵션은 승인 자체를 자동화하지 않습니다.

- GitHub action-confirmation 카드가 보이면 Rerun `POLL`/retry를 잠시 멈춤
- `허용하기`, `대화에서 허용하기`, `Allow` 버튼이나 드롭다운은 자동 클릭하지 않음
- 사용자가 직접 승인하면 ChatGPT action이 계속됨
- 승인 카드가 사라진 뒤 다음 기본 2초 content tick부터 Rerun polling을 자동 재개
- 승인 대기가 retry delay보다 길어져도 같은 control의 resume prompt를 중복 전송하지 않도록 보호
- 설정은 tab-scoped config에 저장되므로 fresh-chat handoff 시 함께 이전

## 기존 수정 유지

- same-sequence의 새 `updated_at`은 fresh authorization
- lifetime `Max sends` 제한 없음
- `Sent`는 진단 통계만
- unchanged control generation만 `Retries / sequence`로 제한
- public GitHub REST rate limit은 watcher Stop이 아니라 pause/resume

## 다음 확인

1. `chrome://extensions`에서 ChatGPT Rerun **v0.2.13 Reload**
2. 기존 SimpleVTT ChatGPT 탭으로 돌아감
3. **GitHub 승인 후 자동 계속** 체크
4. **Save connection** 클릭
5. watcher를 Watching으로 유지/Start
6. GitHub write action 승인 카드가 뜰 때까지 진행
7. 승인하지 않고 retry delay보다 오래 기다려도 duplicate Rerun prompt가 없는지 확인
8. Rerun이 승인 버튼을 자동 클릭하지 않는지 확인
9. 직접 `허용하기` 또는 `대화에서 허용하기` 선택
10. 카드가 사라진 뒤 Start 재클릭 없이 ChatGPT 작업/Rerun polling이 이어지는지 확인

## 검증 상태

- v0.2.13 remote source: COMMITTED / SOURCE-VERIFIED
- approval detector phrase probe: PASS TARGETED
- source regression assertions: COMMITTED
- exact latest full npm suite: NOT_RUN — 이 runtime에 exact GitHub checkout이 없음
- live approval-card browser behavior: PENDING

STATUS는 presentation-only이며 자동화 판단에는 사용하지 않습니다.
