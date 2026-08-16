# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `5`
- Desired control status: `continue`
- Current task: `V02-007`
- Control reason: `v0.2.4 watcher stayed Watching under needs_user; switch the same seq 5 to continue to verify automatic resume without another Start.`
- Phase: `awaiting_same_sequence_terminal_to_continue_autoresume`
- Last checkpoint (UTC): `2026-08-16T15:15:00Z`
- Current execution started (UTC): `2026-08-16T15:15:00Z`
- Current execution hard stop (UTC): `2026-08-16T15:35:00Z`

## Current Objective

Verify the v0.2.4 separation between persistent Chrome watcher state and GitHub work state using the already-running watcher. The user has observed `Tab watcher = Watching` while GitHub control was seq 5 / `needs_user`. Keep the watcher untouched and publish the same seq 5 as `continue`. The acceptance signal is an automatic standard resume prompt in the owning tab without another Start and without waiting for the ordinary same-sequence retry delay.

The authoritative task remains V02-007 at seq 5 so the existing task/run identity is not changed merely for this cross-cutting V02-006 probe. The resulting browser observation is also evidence for V02-006.

## Completed in This Task

- V02-001 through V02-004 remain verified and were not repeated.
- v0.2.4 watcher/work-state separation remains implemented.
- The user is running the v0.2.4 watcher UI and reported `워칭으로 나와.` while GitHub control remained seq 5 / `needs_user`.
- This proves the terminal GitHub state did not automatically disable the Chrome watcher.
- `docs/V02_E2E_RESULT.md` now records this as direct V02-006 terminal-watcher persistence evidence and partial V02-007 Start/watcher evidence.
- PLAN now marks V02-006 `in_progress` while preserving V02-007 `in_progress`.
- No Start action is required or allowed for the next probe; the watcher is already enabled.
- The intended next authoritative control is the same run, same seq 5, same task V02-007, with status `continue`.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Existing v0.2 core browser evidence | prior dogfood | PASS | V02-001~004 remain verified. |
| v0.2.4 terminal wait code | GitHub remote source | PASS | Terminal statuses return wait rather than disabling watcher. |
| v0.2.4 same-sequence re-arm code | GitHub remote source | PASS | Terminal observation arms same-sequence continue as fresh work authorization. |
| Browser watcher remains enabled under `needs_user` | User Side Panel observation | PASS | User reported `워칭으로 나와.` with control still seq 5 / needs_user. |
| Same-sequence terminal -> continue automatic resume | Chrome + GitHub control | IN_PROGRESS | Control will be changed to same seq 5 / continue now; expected automatic prompt without Start. |
| Explicit Stop -> Start round-trip for V02-007 | Chrome Side Panel | NOT_RUN | Still required for full V02-007 acceptance. |
| Full current `npm run check` | local checkout | NOT_RUN | Environment cannot reconstruct latest remote checkout. |
| Full current `npm test` | local checkout | NOT_RUN | Same environment limitation. |

## Pending / Failed

- Publish control LAST as seq 5 / `continue` / V02-007.
- Do not press Start, Stop, Save, or change repository coordinates during the auto-resume observation.
- Confirm whether the standard resume prompt arrives automatically in this already-Watching tab.
- If it arrives, record V02-006 terminal -> continue auto-resume PASS evidence.
- V02-006 still needs any remaining polling/other-stream evidence required by the runbook before final verification.
- V02-007 still needs the explicit Stop -> Start round-trip before final verification.
- V02-008 new-project onboarding and remaining V02-005 safeguards remain later work.

## Files / Areas Touched

- `docs/V02_E2E_RESULT.md`: recorded user-observed Watching state under needs_user and armed same-seq auto-resume probe.
- `.chatgpt-rerun/PLAN.md`: V02-006 moved to in_progress and current probe recorded.
- `.chatgpt-rerun/STATE.md`: same seq 5 now intends `continue` for the auto-resume probe.

## Next Exact Action

Publish `.chatgpt-rerun/control.json` LAST with the same run ID, same sequence 5, same task V02-007, and status `continue`. Then make no browser action and observe whether the owning tab automatically receives the standard resume prompt.

## Do Not Repeat

- Do not repeat V02-001 through V02-004.
- Do not press Start again for this probe.
- Do not increment sequence merely to test watcher resumption; this test specifically requires same-sequence terminal -> continue.
- Do not change task_id for the cross-cutting V02-006 observation; keep seq 5 / V02-007 authoritative identity stable.
- Do not interpret GitHub terminal states as watcher Stop.
- Do not create separate Start/Stop buttons again.
- Do not reset the active run.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- No current blocker. The watcher is already Watching; only the GitHub control transition and browser observation remain for this probe.
