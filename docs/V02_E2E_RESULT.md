# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `WAITING_FOR_EXTENSION_RELOAD`
- Control: seq 5 / `needs_user` / V02-007
- Initial v0.2 Reload confirmed: `2026-08-16T13:55:00Z` (22:55 KST)
- Required next Reload: v0.2.2 unified Start/Stop + automatic repository bootstrap build

## Static validation

| Check | Result | Evidence |
|---|---|---|
| Existing v0.2 core baseline | PASS | Prior core syntax/tests and live V02-001~004 evidence passed before later UX/bootstrap patches. |
| v0.2.1 `popup.js` syntax | PASS | Previously executed directly against the actual remote popup source. |
| v0.2.1 single-toggle regression test | PASS | Previously executed against actual remote popup files: 1/1 PASS. |
| v0.2.2 bootstrap helper syntax/behavior | PASS | Actual updated `control.js` helper content was checked with Node; standard control path accepted, custom path rejected, five-file/control-last/stop-before-first-task prompt invariants passed. |
| v0.2.2 bootstrap regression test files | COMMITTED | `tests/control.test.mjs` includes path/prompt invariants; `tests/bootstrap-flow.test.mjs` covers background/content/popup bootstrap wiring. |
| Full post-v0.2.2 `npm run check` | NOT_RUN | Container cannot resolve github.com for a complete current checkout. Remote sources were re-read after writes; browser Reload/E2E remains required. |
| Full post-v0.2.2 `npm test` | NOT_RUN | Same checkout limitation. Do not claim the complete suite passed. |
| v0.2.2 manifest/package version | PASS | Remote manifest/package now identify version 0.2.2. |

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User completed the two-tab probe and confirmed per-tab panel/session state remained independent. |
| V02-002 same-stream collision guard | PASS | User attempted Start in tab B on the already-owned stream and confirmed the expected error appeared. |
| V02-003 core dispatch/retry regression | PASS | New-sequence dispatch and same-sequence retry occurred in owning tab A; rejected tab B remained at zero counters. |
| V02-004 Continue in new chat | PASS | User ran `Continue in new chat` and confirmed the fresh-chat handoff worked. |
| V02-005 handoff race/failure safeguards | PAUSED | Successful single handoff path is observed. Resume after v0.2.2 browser gates. |
| V02-006 terminal isolation | NOT_RUN | |
| V02-007 unified Start/Stop toggle | WAITING_RELOAD | Implementation/static evidence exists; browser verification requires Reloading v0.2.2. |
| V02-008 automatic repository bootstrap | WAITING_RELOAD | Implementation and helper regression evidence exist; requires a separate safe repo/branch with no standard control file after v0.2.2 Reload. |

## Event log

### v0.2.2 automatic repository bootstrap implemented; Reload required

- Time: `2026-08-16T14:39:00Z` (23:39 KST)
- User requested that when Rerun is started against another GitHub repository, the standard Rerun files be created automatically before work begins.
- New Start behavior probes the configured control first. Existing control follows the normal path.
- If the default `.chatgpt-rerun/control.json` is missing, Start separately verifies that owner/repo/branch itself is readable before bootstrap is allowed.
- Custom missing control paths are not auto-created; unreadable/nonexistent repos/branches are not treated as empty Rerun projects.
- Bootstrap keeps the current tab as the stream owner with `bootstrapPending=true`, suppressing normal sequence claims until control appears.
- One `RERUN_BOOTSTRAP` direct prompt tells ChatGPT to inspect repository instructions/current conversation goal and create or compatibly repair README/PLAN/STATE/STATUS/control.
- Bootstrap requires the human STATUS projection, approximately five-minute active freshness policy, 20-minute execution/checkpoint rules, and `control.json` as the final authoritative state write.
- The bootstrap turn intentionally stops after publishing initial sequence 0 / continue control; the extension then detects control and sends the normal resume prompt to start the first implementation task.
- Chrome extension GitHub credentials remain read-only in design. Repository file writes are delegated to the connected ChatGPT GitHub app.
- Side Panel surfaces `Initializing repository` and disables new-chat handoff while bootstrap is pending.
- `control.js` targeted Node helper checks PASS; complete current checkout tests remain NOT_RUN because the container cannot resolve github.com.
- Extension/package version bumped to 0.2.2.
- Result: implementation/targeted helper verification complete; V02-008 browser E2E waits for Reload and a safe test repository.

### V02-007 single Start/Stop UX implemented; Reload still required

- Time: `2026-08-16T14:21:00Z` (23:21 KST)
- User requested that separate `Start this tab` and `Stop this tab` controls be unified.
- Required UX: Stopped shows `Start`; clicking it starts the current-tab Rerun and changes the same control to `Stop`; clicking `Stop` stops the current-tab Rerun and changes the same control back to `Start`.
- `popup.html`: separate Start/Stop controls removed; one `sessionToggle` added.
- `popup.js`: the toggle reads the latest tab runtime at click time and routes to `START_TAB_SESSION` or `STOP_TAB_SESSION`; runtime refresh renders label/style/ARIA from `runtime.enabled`.
- `tests/popup-ui.test.mjs`: regression test added and previously executed PASS.
- Because local Chrome still predates this patch line, control remains seq 5 / `needs_user` / V02-007. The required Reload target is now v0.2.2 rather than v0.2.1.

### V02-004 fresh-chat handoff PASS

- Time: `2026-08-16T14:17:00Z` (23:17 KST)
- User pressed **Continue in new chat** from the owning session and reported `잘 됐어.` after the requested handoff probe.
- Result: the fresh-chat handoff path succeeded and V02-004 is PASS.
- The user's ChatGPT GitHub app-specific permission was changed to `full_access` to reduce repeated already-connected app-use approval prompts where account/workspace/safety policy permits it.
- This is a ChatGPT app preference, not extension DOM automation and not new GitHub OAuth/repository scope.

### V02-003 per-tab counter isolation PASS

- Time: `2026-08-16T14:09:00Z` (23:09 KST)
- User observation: `응 B에는 0으로 나와`.
- Combined with observed new-sequence auto-dispatch and same-sequence retry, tab B did not inherit tab A's Sent/retry activity.

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

## Issues / design changes found during current run

1. Active `.chatgpt-rerun/README.md` initially referenced historical v0.1 runbooks after the v0.2 reset; corrected.
2. Fresh-chat handoff can encounter ChatGPT app-use approval cards even when GitHub is connected. Preferred mitigation is persisted ChatGPT app permission, never extension-driven approval-card clicking.
3. Separate Start and Stop controls were redundant; v0.2.1+ uses one runtime-driven session toggle.
4. Requiring users to pre-create Rerun files on every repository is unnecessary setup friction. v0.2.2 auto-bootstraps only the standard missing control on a separately readable repo/branch, while preserving custom-path/permission safety boundaries.

## Historical v0.1 evidence

The previous run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch, next-sequence dispatch, and same-sequence retry before the per-tab runtime refactor. Its unfinished later tests are not counted as current v0.2.x evidence.

## Next event

Reload the unpacked extension from the latest `agent/mvp-autoresume` checkout (v0.2.2). First verify V02-007 in the current ChatGPT tab: one session control, `Start -> Stop -> Start`. Then use a separate safe GitHub repository/branch with no `.chatgpt-rerun/control.json` for V02-008. With the default control path, one Start should show `Initializing repository`, send one bootstrap prompt, create/repair the five standard files with control last, then automatically send the normal resume prompt and begin the first task. Do not delete a real project's state files to create this test. After V02-007/008, resume V02-005 and V02-006.
