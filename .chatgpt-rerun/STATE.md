# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `7`
- Desired control status: `needs_user`
- Current task: `V02-008`
- Control reason: `V02-001 through V02-007 are verified; perform the clean new-project Rerun connection-prompt onboarding probe on a separate safe repository.`
- Phase: `awaiting_separate_project_onboarding_probe`
- Last checkpoint (UTC): `2026-08-16T15:20:00Z`
- Current execution started (UTC): `2026-08-16T15:20:00Z`
- Current execution hard stop (UTC): `2026-08-16T15:40:00Z`

## Current Objective

Complete the final browser acceptance item, V02-008, on a separate safe project. The project conversation must already clearly know its GitHub repository. While its watcher is Stopped, send `Rerun 연결 프롬프트` and observe the clean/new-project path that creates or safely repairs the five standard Rerun files before any implementation work begins.

## Completed

- V02-001 tab/session isolation: PASS.
- V02-002 duplicate same-stream ownership rejection: PASS.
- V02-003 new-sequence/same-sequence dispatch and tab-scoped counters: PASS.
- V02-004 fresh-chat GitHub-backed handoff: PASS.
- V02-005 handoff race/failure safeguards: PASS to the stated safely reproducible scope. Successful transfer was observed live; source inspection verifies polling suppression, pre-transfer pending cleanup, post-transfer `handoff_send_failed`, and terminal handoff refusal without watcher shutdown.
- V02-006 persistent watcher across GitHub terminal work states: PASS. Same-sequence `needs_user -> continue` automatically resumed without another Start.
- V02-007 unified Start/Stop watcher: PASS. User completed the explicit Stop -> Start round-trip and reported `잘 됐어.`.
- Current-project connection prompt preservation path: PASS as partial V02-008 evidence; existing run was reconciled and preserved.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~004 live browser core | PASS | Prior dogfood observations retained. |
| V02-005 live successful handoff | PASS | User confirmed fresh-chat handoff worked. |
| V02-005 race/failure control flow | PASS | Remote `background.js` inspection confirms required suppression/cleanup branches. |
| V02-006 watcher persistence + auto-resume | PASS | Watching under `needs_user`, then same-seq `continue` auto-resumed with no Start. |
| V02-007 Stop -> Start round-trip | PASS | User reported requested manual toggle probe worked. |
| V02-008 existing-run preservation | PASS/PARTIAL | Connection prompt reconciled this active project without resetting run state. |
| V02-008 clean new-project creation path | NOT_RUN | Requires separate safe project. |
| Full latest `npm run check` | NOT_RUN | Environment cannot resolve `github.com` for latest checkout. |
| Full latest `npm test` | NOT_RUN | Same environment limitation. |

## Pending

- Use a separate safe project conversation whose GitHub repo/branch is already unambiguous.
- Ensure that project's watcher is Stopped.
- Click `Rerun 연결 프롬프트`.
- Confirm ChatGPT identifies the intended repository rather than guessing.
- Confirm `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, and `control.json` are created or safely repaired.
- For a genuinely new Rerun project, confirm PLAN/STATE reflect the real project goal, control is sequence 0 / `continue`, and control is the last authoritative write.
- Confirm the connection turn ends before implementation.
- Then Start the watcher and confirm the standard resume prompt begins the first task.

## Next Exact Action

Run V02-008 in a separate safe project. Do not alter or delete this repository's existing `.chatgpt-rerun` state to manufacture a clean onboarding case.

## Do Not Repeat

- Do not repeat V02-001 through V02-007.
- Do not reset this active run to test onboarding.
- Do not claim V02-008 clean-project creation PASS until it is actually observed.
- Do not claim the complete latest Node suite passed; it remains unexecuted in this environment.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- Final formal acceptance requires one separate safe GitHub project for the V02-008 clean onboarding probe.