# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `0`
- Desired control status: `continue`
- Current task: `V02-001`
- Control reason: `v0.2 extension Reload confirmed; run the two-tab Side Panel/config/runtime isolation probe.`
- Phase: `awaiting_two_tab_probe`
- Last checkpoint (UTC): `2026-08-16T13:55:00Z`
- Current execution started (UTC): `2026-08-16T13:55:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:15:00Z`

## Current Objective

Execute V02-001 from `docs/V02_E2E_TEST_PLAN.md`: verify that two ChatGPT tabs receive distinct tab-specific Side Panel instances, drafts/config remain isolated, and starting one tab does not start the other tab runtime.

## Completed in This Task

- v0.2 per-tab runtime and fresh-chat handoff implementation is published on `agent/mvp-autoresume`.
- Static validation remains PASS: `npm run check`, `npm test` 20/20, manifest JSON parse.
- User confirmed the latest unpacked extension was reloaded at 2026-08-16 22:55 KST.
- The previous `needs_user` Reload gate is satisfied.
- `docs/V02_E2E_RESULT.md` records the Reload event and V02-001 as IN_PROGRESS.
- PLAN now marks V02-001 `in_progress`.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Syntax | `npm run check` | PASS | Previously verified on v0.2 head. |
| Unit tests | `npm test` | PASS | 20/20 tests. |
| Manifest JSON | JSON parse | PASS | v0.2 manifest valid. |
| Extension Reload | Chrome user observation | PASS | User confirmed Reload at 22:55 KST. |
| Distinct tab IDs | Chrome Side Panel observation | NOT_RUN | Open ChatGPT tab A and B and compare `Chrome tab`. |
| Draft isolation | Chrome Side Panel observation | NOT_RUN | Enter different Owner/Repo drafts in A/B and switch tabs. |
| Runtime isolation | Chrome Side Panel observation | NOT_RUN | Start A; B must remain Stopped. |

## Pending / Failed

- Open a second ChatGPT tab B.
- Open the extension Side Panel in both A and B.
- Confirm their displayed `Chrome tab` IDs differ.
- Enter different temporary Owner/Repository draft values in A and B and verify they do not overwrite each other.
- Restore tab A to `Kaetaeru / chatgpt-rerun-extension / agent/mvp-autoresume / .chatgpt-rerun/control.json`.
- Start tab A only and confirm tab B runtime remains Stopped.
- Record the observed values before marking V02-001 verified.

## Files / Areas Touched

- `docs/V02_E2E_RESULT.md`: Reload gate cleared; V02-001 started.
- `.chatgpt-rerun/PLAN.md`: V02-001 `in_progress`.
- `.chatgpt-rerun/STATE.md`: current browser probe checkpoint.
- `.chatgpt-rerun/control.json`: will be changed last to seq 0 / continue / V02-001.

## Next Exact Action

In Chrome, open ChatGPT tab B. Open ChatGPT Rerun Side Panel in both this tab A and tab B. Verify the `Chrome tab` values differ. Type a distinct temporary Owner/Repo draft in each panel and switch between tabs to confirm each draft remains attached to its own tab. Then restore tab A's GitHub coordinates, Start tab A only, and confirm tab B still shows Stopped.

## Do Not Repeat

- Do not repeat the v0.2 implementation or static tests unless code changes.
- Do not reuse unfinished v0.1 E2E-003/004 as v0.2 evidence.
- Do not mark V02-001 PASS until two distinct tab IDs, draft isolation, and runtime isolation are actually observed.
- Do not start the same GitHub stream on tab B yet; that is V02-002.

## Blockers / User Decisions

- None. Browser observation is the current test step.
