# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `5`
- Desired control status: `needs_user`
- Current task: `V02-007`
- Control reason: `v0.2.3 adds the explicit Rerun connection prompt onboarding plus the unified Start/Stop toggle; reload the unpacked extension before browser verification.`
- Phase: `awaiting_extension_reload_for_v023`
- Last checkpoint (UTC): `2026-08-16T14:51:00Z`
- Current execution started (UTC): `2026-08-16T14:51:00Z`
- Current execution hard stop (UTC): `2026-08-16T15:11:00Z`

## Current Objective

Keep the browser run safely stopped until the unpacked extension is Reloaded at v0.2.3. First verify V02-007: one runtime-driven session button transitions `Start -> Stop -> Start`. Then verify V02-008 on a separate safe project: while Stopped, `Rerun 연결 프롬프트` must send a one-time setup prompt that uses the GitHub repository already known by the current conversation, creates or safely repairs the five Rerun documents, and leaves actual work execution to the later Start action.

## Completed in This Task

- V02-001 through V02-004 remain verified.
- V02-005 remains paused after successful fresh-chat handoff while later browser UX/onboarding changes are behind the Reload gate.
- v0.2.1 unified Start/Stop control remains implemented.
- `.chatgpt-rerun/STATUS.md` remains the human-readable presentation-only live dashboard.
- v0.2.2 safe automatic Start bootstrap remains implemented as a fallback for a readable repository using the standard control path.
- v0.2.3 adds `buildRerunConnectionPrompt()` in `control.js`.
- The connection prompt identifies the project repository from the current conversation's GitHub context; Side Panel owner/repo/branch/path are only an optional hint.
- If multiple repository candidates exist or the target is uncertain, the prompt requires asking the user before writing any files.
- The prompt creates or safely repairs `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, and `control.json`.
- If an active Rerun run already exists, the prompt explicitly preserves run_id, sequence, task, and verification history instead of reinitializing it.
- For a genuinely new project, PLAN/STATE are initialized from the actual project goal and control is published last as version 1 / sequence 0 / `continue`.
- The connection prompt ends after Rerun setup and does not start the first implementation task; the user starts actual Rerun polling with the normal Start control afterward.
- `popup.html` now has a dedicated `Rerun 연결 프롬프트` setup panel.
- `popup.js` sends `RERUN_CONNECT` directly to the current ChatGPT tab, injecting the content script first if necessary.
- The connection button is disabled while the current-tab Rerun runtime is enabled, so an active run cannot be accidentally reinitialized.
- `content.js` accepts `RERUN_CONNECT` through the same idle/empty-composer direct-prompt path used by handoff/bootstrap.
- `tests/control.test.mjs` now covers context-based repository identification, ambiguity refusal, five-file creation, active-run preservation, control-last behavior, and side-panel hint semantics.
- `tests/popup-ui.test.mjs` now covers the explicit connection button, `RERUN_CONNECT` wiring, and running-state disable behavior.
- `docs/V02_E2E_TEST_PLAN.md` now treats explicit connection-prompt onboarding as V02-008; automatic Start bootstrap is documented as fallback rather than the primary UX.
- Extension/package version is now `0.2.3`.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Existing v0.2 core browser evidence | prior dogfood | PASS | V02-001~004 verified before current Reload gate. |
| v0.2.3 connection helper remote inspection | GitHub source re-read | PASS | `buildRerunConnectionPrompt()` contains conversation-context repo identification, ambiguity refusal, five-file setup, active-run preservation, control-last, and stop-before-implementation rules. |
| v0.2.3 popup wiring remote inspection | GitHub source re-read | PASS | `connectPrompt` uses `RERUN_CONNECT`, ensures content script, and is disabled while runtime.enabled. |
| v0.2.3 content direct-prompt wiring | GitHub source re-read | PASS | `RERUN_CONNECT` shares the idle/empty-composer direct prompt path. |
| Updated automated tests committed | GitHub source | PASS | control and popup UI regression tests contain the new connection-prompt assertions. |
| Full current `npm run check` | local checkout | NOT_RUN | Container cannot resolve raw.githubusercontent.com/github.com in this environment; full checkout execution remains unavailable. |
| Full current `npm test` | local checkout | NOT_RUN | Same environment limitation; browser Reload/E2E remains required. |
| Browser V02-007 Start -> Stop -> Start | Chrome Side Panel | NOT_RUN | Requires v0.2.3 Reload. |
| Browser V02-008 connection prompt onboarding | separate safe project | NOT_RUN | Requires v0.2.3 Reload and a project whose repo is already known in the ChatGPT conversation. |

## Pending / Failed

- Reload the unpacked extension in `chrome://extensions` so local Chrome uses v0.2.3.
- Verify V02-007 on the current ChatGPT tab: exactly one session button, `Start -> Stop -> Start`, with current-tab-only runtime changes.
- For V02-008, use a separate safe project conversation that already has a known GitHub repository.
- While Stopped, click `Rerun 연결 프롬프트` and confirm one setup prompt is sent without requiring owner/repo fields to identify the repo.
- Confirm the prompt creates/repairs README/PLAN/STATE/STATUS/control, refuses ambiguous repository selection, preserves any existing active run, publishes new-project control last, and stops before implementation.
- Confirm the connection button is unavailable while Rerun is Running.
- Then configure/confirm owner/repo/branch in the Side Panel and press Start; verify the standard resume prompt starts the first task.
- After V02-008, resume V02-005 and V02-006.

## Files / Areas Touched

- `control.js`: explicit Rerun connection prompt builder.
- `content.js`: `RERUN_CONNECT` direct-prompt support.
- `popup.html`: new project connection setup panel/button.
- `popup.css`: shared setup panel styling.
- `popup.js`: connection prompt send action, content-script bootstrap, running-state disable guard.
- `tests/control.test.mjs`: connection prompt contract tests.
- `tests/popup-ui.test.mjs`: connection button/wiring regressions.
- `manifest.json`, `package.json`: version `0.2.3`.
- `docs/V02_E2E_TEST_PLAN.md`: V02-008 changed to explicit connection-prompt onboarding; Start bootstrap retained as fallback.
- `.chatgpt-rerun/PLAN.md`: v0.2.3 onboarding acceptance and decisions.

## Next Exact Action

User Reloads the unpacked extension from the latest `agent/mvp-autoresume` checkout (v0.2.3). First perform V02-007 `Start -> Stop -> Start`. Then in a separate safe project conversation whose GitHub repo is already known, press `Rerun 연결 프롬프트` while Stopped and verify the five-file setup/repair flow before pressing Start.

## Do Not Repeat

- Do not repeat V02-001 through V02-004.
- Do not rely on a pre-v0.2.3 loaded Side Panel for V02-007 or V02-008 evidence.
- Do not create separate Start/Stop controls again.
- Do not send the connection prompt while the runtime is enabled.
- Do not require owner/repo fields merely to let ChatGPT identify the repository for the connection prompt; current conversation GitHub context is primary.
- Do not reset an existing active Rerun run during connection setup.
- Do not grant the Chrome extension GitHub write permission for onboarding; writes belong to the connected ChatGPT GitHub app.
- Do not resume V02-005 automatic progression until v0.2.3 Reload and the new browser gates are addressed.
- Do not automate ChatGPT app approval, OAuth authorization, or administrator-approval button clicks in the extension.
- Do not use STATUS to decide recovery, sequence, task, or terminal state.

## Blockers / User Decisions

- User action required: Reload the unpacked extension to v0.2.3. V02-008 also needs a separate safe project conversation with a clearly identified GitHub repository.
