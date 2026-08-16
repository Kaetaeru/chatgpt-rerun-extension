# ChatGPT Rerun v0.2 E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `IN_PROGRESS`
- Control: seq 1 / `continue` / V02-002, preparing transition after V02-002 PASS
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
| V02-002 same-stream collision guard | PASS | User attempted Start in tab B using the same owner/repo/branch/control path as running tab A and confirmed the expected error appeared. The duplicate session did not take ownership. |
| V02-003 core dispatch/retry regression | IN_PROGRESS | New-sequence dispatch is PASS: seq 1 auto-dispatched in owning tab A at 23:03 KST. Same-sequence retry is also observed: the immediately preceding automatic resume message arrived again while GitHub control remained seq 1 / continue / V02-002. Remaining explicit isolation check is that retry/max-send counters stay scoped to tab A. |
| V02-004 Continue in new chat | NOT_RUN | |
| V02-005 handoff race/failure safeguards | NOT_RUN | |
| V02-006 terminal isolation | NOT_RUN | |

## Event log

### V02-002 duplicate stream rejection PASS

- Time: observed before `2026-08-16T14:07:00Z` (23:07 KST)
- Control remained: seq 1 / continue / V02-002.
- User configured tab B with the same GitHub stream as the running tab A and pressed Start.
- User observation: `응 오류가 떴어` in direct response to the duplicate-stream probe.
- Expected behavior: tab B Start is rejected instead of creating a second owner for the same stream.
- Result: V02-002 PASS.

### v0.2 seq 1 same-sequence retry observed

- Time: immediately before the duplicate-stream result above; exact client timestamp not recorded.
- GitHub control was still seq 1 / continue / V02-002.
- The exact configured resume prompt automatically arrived again in the owning conversation without a sequence change.
- Because seq 1 had already auto-dispatched once at 23:03 KST, this later delivery is a real same-sequence retry under the v0.2 per-tab runtime.
- Result: V02-003 same-sequence retry sub-check PASS.

### v0.2 seq 1 new-sequence auto-dispatch observed

- Time: `2026-08-16T14:03:00Z` (23:03 KST)
- Control before: seq 1 / continue / V02-002
- Trigger observed: exact configured resume prompt was automatically delivered in the current owning ChatGPT tab after GitHub advanced from seq 0 to seq 1.
- Preflight: control and STATE matched on run_id `chatgpt-rerun-v02-20260816-01`, sequence 1, `continue`, V02-002.
- Evidence gained: v0.2 per-tab runtime preserves new-sequence automatic dispatch on the owning tab.
- Result: V02-003 new-sequence-dispatch sub-check PASS.

### V02-001 tab isolation PASS

- Time: `2026-08-16T14:01:00Z` (23:01 KST)
- Prior control: seq 0 / continue / V02-001
- User observation: `분리 잘 됐어.` after following the two-tab isolation probe.
- Probe context: two ChatGPT tabs were opened with tab-specific Side Panels; distinct per-tab state/drafts/runtime were checked; tab A was the owning/running session and tab B remained separate.
- Result: V02-001 PASS.

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

Close V02-002 in PLAN/STATE. V02-003 already has live evidence for both new-sequence dispatch and same-sequence retry on owning tab A; verify that tab B's retry/run counters remain unaffected before closing V02-003. Then proceed to fresh-chat handoff V02-004.
