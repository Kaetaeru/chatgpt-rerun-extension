# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `5`
- Desired control status: `needs_user`
- Current task: `V02-007`
- Control reason: `v0.2.2 includes the unified Start/Stop toggle and safe automatic repository bootstrap; reload the unpacked extension before browser verification.`
- Phase: `awaiting_extension_reload_for_v022`
- Last checkpoint (UTC): `2026-08-16T14:39:00Z`
- Current execution started (UTC): `2026-08-16T14:39:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:59:00Z`

## Current Objective

Keep the browser run safely stopped until the unpacked extension is Reloaded at v0.2.2. First verify V02-007: one runtime-driven session button transitions `Start -> Stop -> Start`. Then verify V02-008 on a separate safe GitHub test repository that has no `.chatgpt-rerun/control.json`: one Start should bootstrap the standard five files through ChatGPT and automatically transition to the normal first-task Rerun.

The current machine task remains V02-007 because the local Chrome build must be Reloaded before either new v0.2.1/v0.2.2 behavior is valid browser evidence. V02-008 is queued immediately after V02-007.

## Completed in This Task

- V02-001 through V02-004 remain verified.
- V02-005 remains paused after the successful fresh-chat handoff while newer browser UX/bootstrap changes are gated behind Reload.
- v0.2.1 unified Start/Stop control remains implemented and covered by the previously executed UI-specific static test.
- `.chatgpt-rerun/STATUS.md` remains the human-readable presentation-only live dashboard; the five-file protocol and template are already documented.
- v0.2.2 automatic repository bootstrap was implemented without adding GitHub contents-write permission to the Chrome extension.
- `control.js` now exposes `isAutoBootstrapPath()` and `buildRepositoryBootstrapPrompt()` and runtime fields `bootstrapPending`, `bootstrapRequestedAt`, `bootstrapCompletedAt`.
- Start now probes the configured control. If the standard `.chatgpt-rerun/control.json` is missing, it independently verifies that the configured repo/branch is readable before treating the target as a bootstrap candidate.
- A missing custom control path is not auto-created. An inaccessible repo/branch 404/auth failure is not treated as an empty Rerun project.
- During bootstrap, runtime remains enabled but `bootstrapPending=true`; the same stream stays owned by the tab and normal sequence claims are suppressed.
- `content.js` accepts `RERUN_BOOTSTRAP` as a direct prompt path using the same safe composer-idle checks as new-chat handoff; it still does not inspect assistant response content.
- The bootstrap prompt instructs ChatGPT to inspect repository/project instructions and the current conversation goal, create or compatibly repair README/PLAN/STATE/STATUS/control, keep STATUS presentation-only with about five-minute active freshness, use 20-minute execution rules, and publish control last.
- Bootstrap explicitly ends before the first implementation task. Once control appears, the background polling path clears `bootstrapPending` and the normal configured resume prompt starts the first task.
- The Side Panel shows `Initializing repository` during bootstrap, keeps the single session button in running/Stop semantics, and disables new-chat handoff until bootstrap completes.
- `tests/control.test.mjs` adds bootstrap path/prompt invariants; `tests/bootstrap-flow.test.mjs` adds static wiring regressions.
- Extension/package version is now `0.2.2`; README and `docs/V02_E2E_TEST_PLAN.md` document the safe automatic-bootstrap behavior and V02-008.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Existing v0.2 core browser evidence | prior dogfood | PASS | V02-001~004 verified before current Reload gate. |
| v0.2.1 single-toggle static verification | prior direct Node checks | PASS | popup syntax and single-toggle regression test previously passed. |
| v0.2.2 bootstrap helper syntax/behavior | `node --check` + direct assertions against actual updated `control.js` helper content | PASS | Standard path accepted, custom path rejected, bootstrap prompt contains all five files/control-last/stop-before-first-task rules, bootstrap runtime default is false. |
| v0.2.2 background/content/popup full `npm run check` | local full checkout | NOT_RUN | Container cannot resolve github.com, so a full current checkout is unavailable; browser Reload/E2E remains required. Remote source was re-read after writes and the bootstrap state transitions were inspected. |
| v0.2.2 full `npm test` | local full checkout | NOT_RUN | New tests are committed but full suite cannot be run from a network checkout in this container. |
| Browser V02-007 stopped state | Chrome Side Panel | NOT_RUN | Requires v0.2.2 Reload. |
| Browser V02-007 Start -> Stop -> Start | Chrome Side Panel | NOT_RUN | Requires v0.2.2 Reload. |
| Browser V02-008 standard missing-control bootstrap | separate safe test repo | NOT_RUN | Must be tested after Reload. |
| V02-008 custom-path/inaccessible-target safeguards | separate safe test setup | NOT_RUN | Must not mutate an existing real project to create the test. |

## Pending / Failed

- Reload the unpacked extension in `chrome://extensions` so local Chrome uses v0.2.2.
- Verify V02-007 on the current ChatGPT tab: exactly one session button, `Start -> Stop -> Start`, with current-tab-only runtime changes.
- For V02-008, choose/create a separate safe GitHub test repository or branch that the extension can read and that does not contain `.chatgpt-rerun/control.json`.
- In that test tab set the default control path and press Start once.
- Confirm `Initializing repository`, one bootstrap prompt, five-file creation/repair, control-last sequence 0 continue publication, then automatic standard resume/first-task start.
- Confirm custom missing control path and unreadable repo/branch do not auto-bootstrap.
- Record V02-008 evidence, then resume V02-005 and V02-006.

## Files / Areas Touched

- `control.js`: bootstrap runtime fields, standard-path predicate, bootstrap prompt builder.
- `background.js`: missing-control probe, repo/branch accessibility check, bootstrap pending monitor, automatic transition to normal control execution, bootstrap/handoff guards.
- `content.js`: direct `RERUN_BOOTSTRAP` prompt support without assistant-output parsing.
- `popup.js`: initializing state, bootstrap runtime reset, handoff disable while initializing.
- `popup.html`: Start auto-initialization disclosure.
- `tests/control.test.mjs`: bootstrap helper invariants.
- `tests/bootstrap-flow.test.mjs`: bootstrap wiring regressions.
- `manifest.json`, `package.json`: v0.2.2.
- `README.md`: automatic repository bootstrap behavior/safety model.
- `docs/V02_E2E_TEST_PLAN.md`: V02-008.
- `.chatgpt-rerun/PLAN.md`: V02-008 acceptance gate and v0.2.2 decisions.

## Next Exact Action

User Reloads the unpacked extension from the latest `agent/mvp-autoresume` checkout (v0.2.2). First perform the short V02-007 `Start -> Stop -> Start` probe in the current tab. After that passes, use a separate safe repository/branch with no standard control file for V02-008 and press Start once; observe repository bootstrap followed by normal automatic first-task resume. Do not use an existing project's state deletion as the bootstrap test.

## Do Not Repeat

- Do not repeat V02-001 through V02-004.
- Do not rely on the currently loaded pre-v0.2.2 Side Panel for V02-007 or V02-008 evidence.
- Do not create separate Start/Stop controls again.
- Do not grant the Chrome extension GitHub write permission for bootstrap; writes belong to the connected ChatGPT GitHub app.
- Do not auto-bootstrap a custom missing control path or an unreadable repository/branch.
- Do not delete a real project's `.chatgpt-rerun` state to force V02-008.
- Do not resume V02-005 automatic progression until v0.2.2 Reload and the new browser gates are addressed.
- Do not automate ChatGPT app approval, OAuth authorization, or administrator-approval button clicks in the extension.
- Do not use STATUS to decide recovery, sequence, task, or terminal state.

## Blockers / User Decisions

- User action required: Reload the unpacked extension to v0.2.2. V02-008 also needs a separate safe GitHub repository/branch with no standard control file for destructive-free bootstrap verification.
