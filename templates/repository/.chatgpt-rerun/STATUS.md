# ChatGPT Rerun Live Status

> 사람을 위한 읽기 전용 현황판입니다. 자동 재개/reconciliation의 source of truth는 `README.md`, `control.json`, `STATE.md`, `PLAN.md`입니다. 이 파일이 다른 파일과 충돌하면 다른 네 파일을 우선합니다.

## At a glance

| Item | Current |
|---|---|
| Last updated | `replace-me` |
| Run | `replace-me` |
| Sequence | `0` |
| Control status | `needs_user` |
| Current task | `TASK-001` |
| Activity | Waiting for initialization |
| Overall progress | NOT_STARTED |

## 지금 무슨 일이 진행 중인가

<!-- 기술 세부사항보다 사용자가 이해할 수 있는 말로 현재 작업을 2~5문장으로 설명 -->

## Progress

| Task / milestone | Status | 사용자 관점 요약 |
|---|---|---|
| TASK-001 | PENDING | <!-- 무엇을 확인/완료하는 단계인지 --> |

## 최근 확인된 것

- <!-- 최근 PASS/검증/중요한 결정 -->

## 지금 사용자가 해야 할 것

- 없음.

<!-- needs_user일 때는 사용자가 해야 할 행동을 한 문단으로 명확히 적는다. -->

## 그 다음 자동 작업

<!-- 현재 단계가 끝난 뒤 자동으로 무엇을 할지 -->

## Blockers / risks

- 없음.

## Freshness policy

이 파일은 presentation-only projection이다.

- 상태/task/sequence/blocker/검증 결과가 바뀌면 즉시 갱신한다.
- 실행이 길게 이어질 때는 마지막 STATUS 갱신 후 최대 약 5분을 목표로 다음 안전한 체크포인트에서 갱신한다.
- 18분 time-budget checkpoint와 실행 종료 전에 내용이 달라졌다면 반드시 갱신한다.
- 내용 변화가 없으면 단순히 시각만 바꾸기 위한 커밋을 만들지 않는다.
- ChatGPT가 idle/stopped인 동안에는 빈 heartbeat 커밋을 만들지 않는다.
- `control.json`은 마지막 authoritative state write다. STATUS는 그 뒤에 갱신할 수 있으나 reconciliation에는 절대 사용하지 않는다.
