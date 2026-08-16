# Rerun State

## Identity

- Run ID: `replace-me`
- Sequence: `0`
- Desired control status: `needs_user`
- Current task: `TASK-001`
- Control reason: `Initialize PLAN.md and STATE.md, then publish status=continue.`
- Phase: `not_started`
- Last checkpoint (UTC): `replace-me`
- Current execution started (UTC): `replace-me`
- Current execution hard stop (UTC): `replace-me` <!-- started + 20 minutes -->

`Sequence`, `Desired control status`, `Current task`, and `Control reason` describe the control state that should eventually be published to `control.json`. During a normal run they match `control.json`. During a crash between STATE and control writes, STATE may be exactly one sequence ahead; the next execution must reconcile that handoff instead of repeating verified work.

`Current execution started`와 `Current execution hard stop`은 **이번 ChatGPT 실행(turn)**의 20분 시간 예산을 기록한다. 같은 sequence가 재실행되면 이 두 값을 새 실행 기준으로 갱신한다.

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

## Time-budget checkpoint rule

현재 실행이 약 18분에 도달하면 새 장기 작업을 시작하지 않고 이 STATE를 먼저 갱신한다. 20분 hard stop 전에 종료해야 하며, task가 아직 verified가 아니면 current `continue` + 같은 sequence를 유지한 채 Phase를 `time_budget_checkpoint`로 기록하고 다음 실행이 `Next Exact Action`부터 이어가게 한다.
