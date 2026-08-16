# Rerun State

## Identity

- Run ID: `replace-me`
- Sequence: `0`
- Desired control status: `needs_user`
- Current task: `TASK-001`
- Control reason: `Initialize PLAN.md and STATE.md, then publish status=continue.`
- Phase: `not_started`
- Last checkpoint (UTC): `replace-me`

`Sequence`, `Desired control status`, `Current task`, and `Control reason` describe the control state that should eventually be published to `control.json`. During a normal run they match `control.json`. During a crash between STATE and control writes, STATE may be exactly one sequence ahead; the next execution must reconcile that handoff instead of repeating verified work.

## Current Objective

<!-- 이번 sequence에서 완료해야 하는 정확한 목표 -->

## Completed in This Task

- <!-- 이미 완료된 구현/조사/수정 -->

## Verification

| Check | Command | Result | Evidence / note |
|---|---|---|---|
| Test | `<!-- command -->` | NOT_RUN | |
| Lint | `<!-- command -->` | NOT_RUN | |
| Build | `<!-- command -->` | NOT_RUN | |

Result vocabulary: `NOT_RUN`, `PASS`, `FAIL`, `N/A`.

## Pending / Failed

- <!-- 아직 해야 할 일 또는 실패 원인 -->

## Files / Areas Touched

- <!-- path: what changed -->

## Next Exact Action

<!-- 다음 실행이 바로 수행할 한 가지 구체적 행동 -->

## Do Not Repeat

- <!-- 이미 검증되어 반복할 필요가 없는 작업 -->

## Blockers / User Decisions

- None.
