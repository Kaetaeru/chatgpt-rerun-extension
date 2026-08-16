# ChatGPT Rerun v0.2 E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `IN_PROGRESS`
- Control: seq 1 / `continue` / V02-002
- Extension Reload confirmed: `2026-08-16T13:55:00Z` (22:55 KST)

## Static validation

| Check | Result | Evidence |
|---|---|---|
| `npm run check` | PASS | background/content/control/popup JavaScript parsed successfully |
| `npm test` | PASS | 20/20 tests |
| manifest JSON parse | PASS | v0.2 manifest is valid JSON |

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | After v0.2 Reload, seq 0 auto-dispatch worked in tab A. User then completed the two-tab probe and confirmed the tabs were properly separated: tab-specific panel/session state stayed independent and starting the owning tab did not cause the other tab to run. |
| V02-002 same-stream collision guard | IN_PROGRESS | Tab A remains the owning session. Still requires pressing Start in tab B with the exact same owner/repo/branch/control path and observing rejection while A remains running. |
| V02-003 core dispatch/retry regression | IN_PROGRESS | New-sequence dispatch condition is now observed: after control advanced from seq 0 to seq 1, the configured resume prompt arrived automatically in owning tab A at 23:03 KST. Same-sequence retry under v0.2 still remains to be observed. |
| V02-004 Continue in new chat | NOT_RUN | |
| V02-005 handoff race/failure safeguards | NOT_RUN | |
| V02-006 terminal isolation | NOT_RUN | |

## Event log

### v0.2 seq 1 new-sequence auto-dispatch observed

- Time: `2026-08-16T14:03:00Z` (23:03 KST)
- Control before: seq 1 / continue / V02-002
- Trigger observed: exact configured resume prompt was automatically delivered in the current owning ChatGPT tab after GitHub advanced from seq 0 to seq 1.
- Preflight: control and STATE matched on run_id `chatgpt-rerun-v02-20260816-01`, sequence 1, `continue`, V02-002.
- Evidence gained: v0.2 per-tab runtime preserves new-sequence automatic dispatch on the owning tab.
- Evidence not gained: no observation yet that tab B rejects an attempted duplicate-stream Start.
- Result: V02-003 new-sequence-dispatch sub-check PASS; V02-003 remains IN_PROGRESS until same-sequence retry is observed. V02-002 remains IN_PROGRESS.

### V02-001 tab isolation PASS

- Time: `2026-08-16T14:01:00Z` (23:01 KST)
- Prior control: seq 0 / continue / V02-001
- User observation: `분리 잘 됐어.` after following the two-tab isolation probe.
- Probe context: two ChatGPT tabs were opened with tab-specific Side Panels; distinct per-tab state/drafts/runtime were checked; tab A was the owning/running session and tab B remained separate.
- Result: V02-001 PASS.
- Next: V02-002 same-stream collision guard.

### v0.2 seq 0 automatic dispatch observed

- Time: `2026-08-16T13:58:00Z` (22:58 KST)
- Control before: seq 0 / continue / V02-001
- Trigger observed: exact configured resume prompt was automatically delivered into the current ChatGPT conversation after the v0.2 Reload and Start flow.
- Preflight: control and STATE matched on run_id, sequence 0, continue, V02-001.
- Evidence gained: tab A startup/dispatch path is functional under the per-tab runtime refactor.
- Result at that point: partial V02-001 evidence; later closed PASS by the two-tab user observation at 23:01 KST.

### v0.2 Reload gate cleared

- Time: `2026-08-16T13:55:00Z`
- User confirmed the unpacked extension was reloaded from the latest `agent/mvp-autoresume` checkout.
- The previous `needs_user` gate was satisfied and V02-001 started on sequence 0.

## Issues found during v0.2 run

1. Active `.chatgpt-rerun/README.md` still referenced the historical v0.1 `docs/E2E_*` runbook and fixed E2E-004 completion semantics after the v0.2 reset. This documentation drift was corrected during the seq 0 run so future automatic executions read `docs/V02_E2E_TEST_PLAN.md`, `docs/V02_E2E_RESULT.md`, and `docs/TAB_SESSIONS_AND_HANDOFF.md`.

## Historical v0.1 evidence

The previous run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch, next-sequence dispatch, and same-sequence retry before the per-tab runtime refactor. The unfinished handoff-reconciliation and terminal tests from that run are not counted as v0.2 evidence.

## Next event

Complete V02-002. Keep tab A running on `Kaetaeru/chatgpt-rerun-extension`, branch `agent/mvp-autoresume`, control `.chatgpt-rerun/control.json`. In tab B enter the exact same GitHub coordinates and press Start. PASS requires B to reject the duplicate stream with an already-running-tab error while A remains running and unaffected.
