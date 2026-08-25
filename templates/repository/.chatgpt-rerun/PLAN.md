# Rerun Plan

## Goal

<!-- 최종적으로 달성해야 할 결과를 한 문단으로 작성한다. -->

## Definition of Done

- [ ] 최종 산출물이 요구사항을 충족한다.
- [ ] 필수 검증이 모두 PASS다.
- [ ] 문서/설정 변경이 필요한 경우 반영되었다.
- [ ] 알려진 blocker가 없다.

## Constraints

- 한 번의 ChatGPT 실행(turn)은 시작부터 종료까지 20분 hard stop을 넘기지 않는다. 미완료 시 STATE를 체크포인트하고 같은 sequence에서 다음 실행으로 재개한다.
- <!-- 변경하면 안 되는 범위, 호환성, 기술 제약 등을 기록한다. -->

## Validation Baseline

- Test: `<!-- command -->`
- Lint: `<!-- command or N/A -->`
- Build: `<!-- command or N/A -->`
- Typecheck: `<!-- command or N/A -->`

## Tasks

| ID | Status | Depends on | Task | Acceptance criteria |
|---|---|---|---|---|
| TASK-001 | pending | - | <!-- 첫 작업 --> | <!-- 검증 가능한 완료 조건 --> |
| TASK-002 | pending | TASK-001 | <!-- 다음 작업 --> | <!-- 검증 가능한 완료 조건 --> |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- <!-- 장기적으로 유지해야 할 결정과 이유를 기록한다. -->
