# ChatGPT Rerun v0.2/v0.2.1 E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `WAITING_FOR_EXTENSION_RELOAD`
- Control: seq 5 / `needs_user` / V02-007
- Initial v0.2 Reload confirmed: `2026-08-16T13:55:00Z` (22:55 KST)
- Required next Reload: v0.2.1 single Start/Stop toggle build

## Static validation

| Check | Result | Evidence |
|---|---|---|
| Existing v0.2 core baseline | PASS | Prior `npm run check`, `npm test` 20/20, and manifest parse passed before the UI-only patch. Background/content/control code is unchanged by v0.2.1. |
| v0.2.1 `popup.js` syntax | PASS | `node --check popup.js` executed against the actual remote file contents after the UX patch. |
| v0.2.1 single-toggle regression test | PASS | `node --test tests/popup-ui.test.mjs` executed against the actual remote popup files: 1/1 PASS. |
| v0.2.1 manifest/package JSON | PASS | Both updated JSON files parsed successfully in Node. |
| Full post-patch `npm test` suite | NOT_RUN | Container has no GitHub network checkout; the new UI-specific test was run directly from the actual remote file contents. |

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User completed the two-tab probe and confirmed per-tab panel/session state remained independent. |
| V02-002 same-stream collision guard | PASS | User attempted Start in tab B on the already-owned stream and confirmed the expected error appeared. |
| V02-003 core dispatch/retry regression | PASS | New-sequence dispatch and same-sequence retry occurred in owning tab A; rejected tab B remained at zero counters. |
| V02-004 Continue in new chat | PASS | User ran `Continue in new chat` and confirmed the fresh-chat handoff worked. |
| V02-005 handoff race/failure safeguards | PAUSED | Successful single handoff path is observed. Resume after the v0.2.1 Reload/UI gate. |
| V02-006 terminal isolation | NOT_RUN | |
| V02-007 unified Start/Stop toggle | WAITING_RELOAD | Code/static regression check PASS; browser verification requires Reloading v0.2.1. |

## Event log

### V02-007 single Start/Stop UX implemented; Reload required

- Time: `2026-08-16T14:21:00Z` (23:21 KST)
- User requested that separate `Start this tab` and `Stop this tab` controls be unified.
- Required UX: Stopped shows `Start`; clicking it starts the current-tab Rerun and changes the same control to `Stop`; clicking `Stop` stops the current-tab Rerun and changes the same control back to `Start`.
- `popup.html`: separate Start/Stop controls removed; one `sessionToggle` added.
- `popup.js`: the toggle reads the latest tab runtime at click time and routes to `START_TAB_SESSION` or `STOP_TAB_SESSION`; runtime refresh renders label/style/ARIA from `runtime.enabled`.
- `popup.css`: footer simplified to Save + session toggle.
- `tests/popup-ui.test.mjs`: new regression test added.
- Extension/package version bumped to `0.2.1`.
- Direct validation against the actual remote files: popup syntax PASS, UI test 1/1 PASS, manifest/package JSON PASS.
- Because local Chrome is still running the pre-patch unpacked build, the control was intentionally changed to seq 5 / `needs_user` / V02-007. This prevents stale code from consuming further automatic work before Reload.
- Result: implementation/static verification PASS; browser V02-007 remains waiting for Reload.

### V02-004 fresh-chat handoff PASS

- Time: `2026-08-16T14:17:00Z` (23:17 KST)
- Control before transition: seq 3 / continue / V02-004.
- User pressed **Continue in new chat** from the owning session and reported `잘 됐어.` after the requested handoff probe.
- Result: the fresh-chat handoff path succeeded and V02-004 is PASS.
- The user additionally requested that repeated GitHub-use approval prompts not interrupt future fresh-chat handoffs.
- ChatGPT's GitHub app-specific permission was changed to `full_access` so already-connected GitHub app actions can run without the normal per-use approval prompt where account/workspace and safety policy permit it.
- This permission preference is a ChatGPT app setting, not DOM automation in the Chrome extension, and it does not grant new GitHub OAuth/repository scopes.

### V02-003 per-tab counter isolation PASS

- Time: `2026-08-16T14:09:00Z` (23:09 KST)
- User observation: `응 B에는 0으로 나와`.
- Combined with the observed new-sequence auto-dispatch and same-sequence retry, this confirms tab B did not inherit tab A's Sent / retry activity.

### V02-002 duplicate stream rejection PASS

- Time: observed before `2026-08-16T14:07:00Z` (23:07 KST)
- User configured tab B with the same GitHub stream as running tab A and pressed Start.
- User observation: `응 오류가 떴어`.
- Result: duplicate ownership was rejected.

### v0.2 seq 1 same-sequence retry observed

- GitHub control remained seq 1 / continue / V02-002.
- The configured resume prompt automatically arrived again without a sequence change.
- Result: V02-003 same-sequence retry sub-check PASS.

### v0.2 seq 1 new-sequence auto-dispatch observed

- Time: `2026-08-16T14:03:00Z` (23:03 KST)
- The configured resume prompt automatically arrived in owning tab A after GitHub advanced from seq 0 to seq 1.
- Result: V02-003 new-sequence-dispatch sub-check PASS.

### V02-001 tab isolation PASS

- Time: `2026-08-16T14:01:00Z` (23:01 KST)
- User observation: `분리 잘 됐어.`
- Result: per-tab panel/config/draft/runtime isolation PASS.

### v0.2 Reload gate cleared

- Time: `2026-08-16T13:55:00Z`
- User confirmed the unpacked v0.2 extension was reloaded.

## Issues found during v0.2/v0.2.1 run

1. Active `.chatgpt-rerun/README.md` initially referenced the historical v0.1 `docs/E2E_*` runbook after the v0.2 reset. This was corrected.
2. Fresh-chat handoff may encounter ChatGPT app-use approval cards even when GitHub is already connected. Preferred mitigation is ChatGPT's persisted GitHub app permission, not extension-driven approval-card clicking.
3. Separate Start and Stop footer controls were unnecessarily redundant. v0.2.1 replaces them with one runtime-driven session toggle.

## Historical v0.1 evidence

The previous run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch, next-sequence dispatch, and same-sequence retry before the per-tab runtime refactor. The unfinished handoff-reconciliation and terminal tests from that run are not counted as current v0.2/v0.2.1 evidence.

## Next event

Reload the unpacked extension from the latest `agent/mvp-autoresume` checkout (v0.2.1). In the current ChatGPT tab, verify the Side Panel shows exactly one session control. While Stopped it must say `Start`; clicking it must make the tab Running and change the same control to `Stop`; clicking `Stop` must make the tab Stopped and change the same control back to `Start`. After V02-007 PASS, restore the dogfood run to `continue` and resume V02-005, then V02-006.
