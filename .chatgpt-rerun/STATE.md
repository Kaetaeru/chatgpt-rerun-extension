# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `1`
- Desired control status: `continue`
- Current task: `V02-002`
- Control reason: `V02-001 tab isolation verified; test duplicate GitHub stream rejection in tab B while tab A remains running.`
- Phase: `awaiting_same_stream_collision_probe`
- Last checkpoint (UTC): `2026-08-16T14:01:00Z`
- Current execution started (UTC): `2026-08-16T14:01:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:21:00Z`

## Current Objective

Execute V02-002 from `docs/V02_E2E_TEST_PLAN.md`: while tab A remains enabled on `Kaetaeru/chatgpt-rerun-extension`, configure tab B with the exact same owner/repo/branch/control path and press Start. The second Start must be rejected and tab A must remain running.

## Completed in This Task

- v0.2 extension Reload gate passed.
- Tab A seq 0 automatic dispatch worked under the per-tab runtime.
- User completed the two-tab isolation probe and reported `분리 잘 됐어.` at 23:01 KST.
- V02-001 is therefore verified: tab-specific sessions/config/drafts/runtime remained separated and starting the owning tab did not make the other tab run.
- `docs/V02_E2E_RESULT.md` records V02-001 PASS.
- PLAN marks V02-001 `verified` and V02-002 `in_progress`.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Syntax | `npm run check` | PASS | Previously verified on v0.2 head. |
| Unit tests | `npm test` | PASS | 20/20 tests. |
| Manifest JSON | JSON parse | PASS | v0.2 manifest valid. |
| Extension Reload | Chrome user observation | PASS | User confirmed Reload at 22:55 KST. |
| Tab A automatic dispatch | Chrome runtime observation | PASS | Seq 0 resume prompt automatically arrived at 22:58 KST. |
| V02-001 tab/session separation | Chrome user observation | PASS | User confirmed the two-tab separation probe succeeded at 23:01 KST. |
| V02-002 duplicate stream rejection | Chrome Side Panel observation | NOT_RUN | Must attempt Start on tab B with the exact same stream while A remains enabled. |

## Pending / Failed

- Keep tab A running with Owner `Kaetaeru`, Repository `chatgpt-rerun-extension`, Branch `agent/mvp-autoresume`, Control `.chatgpt-rerun/control.json`.
- In tab B enter the exact same four GitHub coordinates.
- Press Start in tab B.
- Confirm B does not enter Running and shows an error indicating the same GitHub control stream is already running in another tab.
- Confirm tab A remains Running and continues to own the stream.
- Record the actual observed error/result before marking V02-002 verified.

## Files / Areas Touched

- `docs/V02_E2E_RESULT.md`: V02-001 PASS and V02-002 next probe.
- `.chatgpt-rerun/PLAN.md`: V02-001 verified; V02-002 in_progress.
- `.chatgpt-rerun/STATE.md`: advanced to seq 1 / V02-002.

## Next Exact Action

On ChatGPT tab B, enter the same GitHub coordinates currently used by tab A (`Kaetaeru / chatgpt-rerun-extension / agent/mvp-autoresume / .chatgpt-rerun/control.json`) and press Start. Observe the Side Panel error and verify B remains stopped while A remains running. Report the observed result; do not change to a different stream yet.

## Do Not Repeat

- Do not repeat V02-001 unless evidence later shows isolation was false.
- Do not rerun static validation unless code changes.
- Do not stop tab A before testing the duplicate-stream guard.
- Do not mark V02-002 PASS without observing the rejected Start in tab B and confirming A is unaffected.

## Blockers / User Decisions

- None. Browser observation of the duplicate-stream Start is the current test step.
