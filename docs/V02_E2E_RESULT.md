# ChatGPT Rerun v0.2 E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `IN_PROGRESS`
- Control: seq 3 / `continue` / V02-004, preparing transition to V02-005
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
| V02-002 same-stream collision guard | PASS | User attempted Start in tab B using the same owner/repo/branch/control path as running tab A and confirmed the expected collision error appeared. The duplicate session did not take ownership. |
| V02-003 core dispatch/retry regression | PASS | Seq 1 auto-dispatched in owning tab A, a later automatic resume arrived again while control remained seq 1, and user confirmed rejected tab B still showed zero run/retry activity instead of inheriting A's counters. |
| V02-004 Continue in new chat | PASS | User ran `Continue in new chat` and confirmed the fresh-chat handoff worked. The successful probe establishes that the workflow moved to a new ChatGPT conversation and resumed through the GitHub-backed handoff path. |
| V02-005 handoff race/failure safeguards | IN_PROGRESS | Successful single handoff path is observed. Continue with non-destructive evidence for ownership continuity and code-level failure/race safeguards. |
| V02-006 terminal isolation | NOT_RUN | |

## Event log

### V02-004 fresh-chat handoff PASS

- Time: `2026-08-16T14:17:00Z` (23:17 KST)
- Control before transition: seq 3 / continue / V02-004.
- User pressed **Continue in new chat** from the owning session and then reported `잘 됐어.` after the requested handoff probe.
- Result: the fresh-chat handoff path succeeded and V02-004 is PASS.
- The user additionally requested that repeated GitHub-use approval prompts not interrupt future fresh-chat handoffs.
- ChatGPT's GitHub app-specific permission was changed to `full_access` so already-connected GitHub app actions can run without the normal per-use approval prompt where the account/workspace and safety policy permit it.
- This permission preference is a ChatGPT app setting, not DOM automation in the Chrome extension, and it does not grant new GitHub OAuth/repository scopes.
- Next: V02-005 handoff race/failure safeguards.

### V02-003 per-tab counter isolation PASS

- Time: `2026-08-16T14:09:00Z` (23:09 KST)
- Control before transition: seq 2 / continue / V02-003.
- User compared the two Side Panels after tab B's duplicate Start had been rejected.
- User observation: `응 B에는 0으로 나와`.
- This confirms tab B did not inherit tab A's Sent / Same-sequence retry activity.
- Combined with the already observed seq 1 new-sequence auto-dispatch and seq 1 same-sequence retry, V02-003 is PASS.
- Next: V02-004 fresh-chat handoff.

### V02-002 duplicate stream rejection PASS

- Time: observed before `2026-08-16T14:07:00Z` (23:07 KST)
- Control remained: seq 1 / continue / V02-002.
- User configured tab B with the same GitHub stream as the running tab A and pressed Start.
- User observation: `응 오류가 떴어` in direct response to the duplicate-stream probe.
- Result: tab B Start was rejected instead of creating a second owner for the same stream.

### v0.2 seq 1 same-sequence retry observed

- Time: immediately before the duplicate-stream result above; exact client timestamp not recorded.
- GitHub control was still seq 1 / continue / V02-002.
- The exact configured resume prompt automatically arrived again in the owning conversation without a sequence change.
- Result: V02-003 same-sequence retry sub-check PASS.

### v0.2 seq 1 new-sequence auto-dispatch observed

- Time: `2026-08-16T14:03:00Z` (23:03 KST)
- Control before: seq 1 / continue / V02-002.
- The configured resume prompt automatically arrived in the owning ChatGPT tab after GitHub advanced from seq 0 to seq 1.
- Result: V02-003 new-sequence-dispatch sub-check PASS.

### V02-001 tab isolation PASS

- Time: `2026-08-16T14:01:00Z` (23:01 KST)
- User observation: `분리 잘 됐어.` after following the two-tab isolation probe.
- Result: V02-001 PASS.

### v0.2 seq 0 automatic dispatch observed

- Time: `2026-08-16T13:58:00Z` (22:58 KST)
- Control before: seq 0 / continue / V02-001.
- The configured resume prompt automatically arrived after the v0.2 Reload and Start flow.

### v0.2 Reload gate cleared

- Time: `2026-08-16T13:55:00Z`
- User confirmed the unpacked extension was reloaded from the latest `agent/mvp-autoresume` checkout.

## Issues found during v0.2 run

1. Active `.chatgpt-rerun/README.md` initially referenced the historical v0.1 `docs/E2E_*` runbook after the v0.2 reset. This documentation drift was corrected so active executions read the v0.2 runbook and handoff document.
2. Fresh-chat handoff may encounter ChatGPT app-use approval cards even when the GitHub account is already connected. The preferred mitigation is ChatGPT's persisted GitHub app permission setting, not extension-driven approval-card clicking.

## Historical v0.1 evidence

The previous run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch, next-sequence dispatch, and same-sequence retry before the per-tab runtime refactor. The unfinished handoff-reconciliation and terminal tests from that run are not counted as v0.2 evidence.

## Next event

Advance to V02-005. Verify the new owning tab receives the next GitHub sequence automatically, confirming ownership continuity after handoff. Use the successful single-handoff observation plus existing implementation/tests to verify `handoffPending` suppresses old-tab polling and that failure paths deterministically release or stop ownership without intentionally forcing a destructive browser failure unless needed.
