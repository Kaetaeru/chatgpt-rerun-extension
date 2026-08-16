# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `1`
- Desired control status: `continue`
- Current task: `V02-002`
- Control reason: `V02-001 tab isolation verified; test duplicate GitHub stream rejection in tab B while tab A remains running.`
- Phase: `awaiting_same_stream_collision_probe`
- Last checkpoint (UTC): `2026-08-16T14:03:00Z`
- Current execution started (UTC): `2026-08-16T14:03:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:23:00Z`

## Current Objective

Execute V02-002 from `docs/V02_E2E_TEST_PLAN.md`: while tab A remains enabled on `Kaetaeru/chatgpt-rerun-extension`, configure tab B with the exact same owner/repo/branch/control path and press Start. The second Start must be rejected and tab A must remain running.

## Completed in This Task

- v0.2 extension Reload gate passed.
- V02-001 is verified: user confirmed the two-tab panel/config/draft/runtime separation probe succeeded.
- After GitHub advanced from seq 0 to seq 1, the exact configured resume prompt automatically arrived in the owning tab A at 23:03 KST.
- That seq 1 arrival proves the v0.2 per-tab runtime preserves new-sequence automatic dispatch on the owning tab; this is partial V02-003 evidence.
- `docs/V02_E2E_RESULT.md` records the seq 1 automatic-dispatch evidence.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Syntax | `npm run check` | PASS | Previously verified on v0.2 head. |
| Unit tests | `npm test` | PASS | 20/20 tests. |
| Manifest JSON | JSON parse | PASS | v0.2 manifest valid. |
| Extension Reload | Chrome user observation | PASS | User confirmed Reload at 22:55 KST. |
| V02-001 tab/session separation | Chrome user observation | PASS | User confirmed the two-tab separation probe succeeded at 23:01 KST. |
| V02-003 new-sequence dispatch | Chrome runtime observation | PASS | Seq 1 resume prompt automatically arrived in owning tab A at 23:03 KST after seq 0 -> seq 1 transition. |
| V02-002 duplicate stream rejection | Chrome Side Panel observation | NOT_RUN | Must attempt Start on tab B with the exact same stream while A remains enabled. |
| V02-003 same-sequence retry | Chrome runtime observation | NOT_RUN | To be exercised after V02-002. |

## Pending / Failed

- Keep tab A running with Owner `Kaetaeru`, Repository `chatgpt-rerun-extension`, Branch `agent/mvp-autoresume`, Control `.chatgpt-rerun/control.json`.
- In tab B enter the exact same four GitHub coordinates.
- Press Start in tab B.
- Confirm B does not enter Running and shows an error indicating the same GitHub control stream is already running in another tab.
- Confirm tab A remains Running and continues to own the stream.
- Record the actual observed error/result before marking V02-002 verified.

## Files / Areas Touched

- `docs/V02_E2E_RESULT.md`: seq 1 new-sequence dispatch evidence recorded.
- `.chatgpt-rerun/STATE.md`: current execution checkpoint refreshed; V02-002 remains the active task.

## Next Exact Action

On ChatGPT tab B, enter the same GitHub coordinates currently used by tab A (`Kaetaeru / chatgpt-rerun-extension / agent/mvp-autoresume / .chatgpt-rerun/control.json`) and press Start. Observe the Side Panel error and verify B remains stopped while A remains running. Report the observed result; do not change to a different stream yet.

## Do Not Repeat

- Do not repeat V02-001 unless evidence later shows isolation was false.
- Do not rerun static validation unless code changes.
- Do not stop tab A before testing the duplicate-stream guard.
- Do not mark V02-002 PASS without observing the rejected Start in tab B and confirming A is unaffected.
- Do not change control.json while V02-002 remains incomplete; keep seq 1 / continue so the owning tab stays resumable.

## Blockers / User Decisions

- None. Browser observation of the duplicate-stream Start is the current test step.
