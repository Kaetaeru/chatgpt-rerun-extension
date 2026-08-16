# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Status: `WAITING_FOR_EXTENSION_RELOAD`
- Control: seq 5 / `needs_user` / V02-007
- Initial v0.2 Reload confirmed: `2026-08-16T13:55:00Z` (22:55 KST)
- Required next Reload: **v0.2.4 persistent tab-watcher build**

## Static / source validation

| Check | Result | Evidence |
|---|---|---|
| Existing v0.2 core baseline | PASS | Prior core syntax/tests and live V02-001~004 evidence passed before later UX/onboarding/watcher patches. |
| v0.2.1 single-toggle targeted check | PASS | Previously executed against actual remote popup files. |
| v0.2.2 bootstrap helper targeted check | PASS | Standard-path and bootstrap prompt invariants were checked directly. |
| v0.2.3 connection-prompt source inspection | PASS | Repo-context identification, ambiguity refusal, active-run preservation, five-file setup, control-last, and stop-before-implementation rules are present. |
| v0.2.4 terminal watcher source inspection | PASS | Terminal statuses return `wait` and no longer call `stopSession(tabId, control.status)` in the control action path. |
| v0.2.4 same-sequence terminal -> continue re-arm | PASS | Terminal handling moves `lastHandledSequence` behind the terminal sequence when safe, so a later same-sequence `continue` is treated as fresh work authorization. |
| v0.2.4 watcher UI source inspection | PASS | Side Panel separates `Tab watcher` from `GitHub work status`, uses `Watching GitHub`, and keeps one Start/Stop watcher button. |
| v0.2.4 regression test files | COMMITTED | `tests/watcher-flow.test.mjs` added; `tests/popup-ui.test.mjs` updated for watcher semantics. |
| Full current `npm run check` | NOT_RUN | Container cannot resolve github.com/raw.githubusercontent.com for a complete latest checkout. Do not claim full suite PASS. |
| Full current `npm test` | NOT_RUN | Same environment limitation. Browser Reload/E2E remains required. |
| v0.2.4 manifest/package version | PASS | Remote manifest/package identify version 0.2.4. |

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User completed the two-tab probe and confirmed per-tab panel/session state remained independent. |
| V02-002 same-stream collision guard | PASS | User attempted Start in tab B on the already-owned stream and confirmed the expected error appeared. |
| V02-003 core dispatch/retry regression | PASS | New-sequence dispatch and same-sequence retry occurred in owning tab A; rejected tab B remained at zero counters. |
| V02-004 Continue in new chat | PASS | User ran `Continue in new chat` and confirmed the fresh-chat handoff worked. |
| V02-005 handoff race/failure safeguards | PAUSED | Successful single handoff path is observed. Remaining safeguards resume after current browser gates. |
| V02-006 persistent watcher across terminal GitHub states | WAITING_RELOAD | New v0.2.4 semantics require browser proof: watcher stays Watching on terminal, polling continues, later continue auto-resumes without another Start. |
| V02-007 unified Start/Stop watcher toggle | WAITING_RELOAD | Browser verification requires Reloading v0.2.4. |
| V02-008 explicit Rerun connection prompt onboarding | PARTIAL | Current-project active-run preservation/reconciliation path was exercised successfully; separate new-project five-file creation path remains. |

## Event log

### v0.2.4 watcher state decoupled from GitHub work state; Reload required

- Time: `2026-08-16T15:02:00Z` (00:02 KST, Aug 17)
- User requested that Chrome tab Start/Stop and GitHub work state be independent.
- Required behavior: once a tab watcher is Started, it keeps polling at the configured interval until explicit Stop/tab close/extension loss or a browser-safety stop, even if GitHub reports `complete`, `needs_user`, or `blocked`.
- `runtime.enabled` now represents the tab watcher only.
- GitHub `continue` is the work-start/resume signal. Terminal statuses pause dispatch but keep the watcher enabled.
- Terminal handling re-arms the terminal sequence so later same-sequence `continue` can dispatch immediately without same-sequence retry delay.
- `max_runs`, `retry_limit`, and `sequence_regressed` now return wait rather than automatically disabling the watcher.
- Terminal GitHub status blocks new-chat handoff without stopping the current watcher.
- Side Panel adds `Tab watcher` and `GitHub work status` as separate rows and renders enabled state as `Watching GitHub`.
- `tests/watcher-flow.test.mjs` was added and `tests/popup-ui.test.mjs` was updated, but the complete current suite was not executed in this environment.
- Extension/package version bumped to 0.2.4.
- Result: implementation/source inspection complete; V02-006/V02-007 browser evidence waits for Reload.

### v0.2.3 explicit connection prompt exercised on current project

- The user invoked the generated Rerun connection prompt in this project conversation.
- Side Panel coordinates matched the actual active repository: `Kaetaeru/chatgpt-rerun-extension` / `agent/mvp-autoresume`.
- Existing `.chatgpt-rerun` files and active run were found and reconciled as Normal.
- Existing run_id / sequence / task / verification history were preserved; no new run was created.
- This is valid partial V02-008 evidence for the existing-active-run preservation path, not the separate-new-project creation path.

### v0.2.3 explicit Rerun connection onboarding implemented

- User refined onboarding: project repo normally already exists and the ChatGPT conversation already knows it.
- Side Panel gained **Rerun 연결 프롬프트** as the preferred setup action.
- The prompt identifies repo/branch from conversation GitHub context, refuses ambiguous selection, creates/repairs README/PLAN/STATE/STATUS/control, preserves active runs, publishes new-project control last, and ends before implementation.
- Start automatic bootstrap from v0.2.2 remains a fallback.

### v0.2.2 automatic repository bootstrap implemented

- Start can safely bootstrap a readable repo when the standard control is missing.
- Custom missing control paths and unreadable repos/branches are not auto-created.
- Bootstrap keeps stream ownership while suppressing normal sequence claims and publishes control last before normal resume begins.

### V02-007 single Start/Stop UX implemented

- User requested one state-driven Start/Stop control instead of separate buttons.
- The control reads current-tab runtime and switches `Start -> Stop -> Start`.
- In v0.2.4 this control is explicitly the **tab watcher** control rather than a mirror of GitHub work status.

### V02-004 fresh-chat handoff PASS

- Time: `2026-08-16T14:17:00Z` (23:17 KST)
- User pressed **Continue in new chat** and confirmed the fresh-chat handoff worked.
- GitHub app-use permission was set to persisted automatic approval where policy permits; extension DOM approval clicking was not added.

### V02-003 per-tab counter isolation PASS

- Time: `2026-08-16T14:09:00Z` (23:09 KST)
- User confirmed tab B remained at zero counters while tab A performed new-sequence dispatch and same-sequence retry.

### V02-002 duplicate stream rejection PASS

- User configured tab B with the same GitHub stream as running tab A and confirmed Start was rejected with the expected error.

### V02-001 tab isolation PASS

- Time: `2026-08-16T14:01:00Z` (23:01 KST)
- User confirmed the two ChatGPT tabs remained properly separated.

## Issues / design changes found during current run

1. Active `.chatgpt-rerun/README.md` initially referenced historical v0.1 runbooks after the v0.2 reset; corrected.
2. Fresh-chat handoff can encounter ChatGPT app-use approval cards even when GitHub is connected. Preferred mitigation is persisted ChatGPT app permission, never extension-driven approval-card clicking.
3. Separate Start and Stop controls were redundant; v0.2.1+ uses one runtime-driven toggle.
4. Requiring users to pre-create Rerun files is unnecessary setup friction; explicit connection onboarding is now preferred and safe automatic bootstrap remains fallback.
5. Treating GitHub terminal status as Chrome Stop prevented long-lived watchers from noticing later work. v0.2.4 separates watcher state from GitHub work state.

## Historical v0.1 evidence

The previous run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch, next-sequence dispatch, and same-sequence retry before the per-tab runtime refactor. Its unfinished later tests are not counted as current v0.2.x evidence.

## Next event

Reload the unpacked extension from latest `agent/mvp-autoresume` (**v0.2.4**). Keep the current GitHub control at seq 5 / `needs_user` and press Start in the current tab. Expected: `Tab watcher = Watching`, `GitHub work status = needs_user`, button = Stop, no resume prompt, and watcher remains Watching after at least one configured poll interval. After this observation, change the same seq 5 control to `continue` and verify the tab auto-resumes without another Start and without waiting for retry delay.
