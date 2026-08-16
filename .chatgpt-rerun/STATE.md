# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `5`
- Desired control status: `needs_user`
- Current task: `V02-007`
- Control reason: `v0.2.4 separates the Chrome tab watcher from GitHub work status; reload the unpacked extension before browser verification.`
- Phase: `awaiting_extension_reload_for_v024`
- Last checkpoint (UTC): `2026-08-16T15:02:00Z`
- Current execution started (UTC): `2026-08-16T15:02:00Z`
- Current execution hard stop (UTC): `2026-08-16T15:22:00Z`

## Current Objective

Keep GitHub work dispatch safely at `needs_user` until the unpacked extension is Reloaded at v0.2.4. After Reload, verify V02-007 first: Start/Stop controls only the current tab's persistent GitHub watcher and the Side Panel separately shows `Tab watcher` and `GitHub work status`. Then verify V02-006: terminal GitHub statuses pause dispatch without disabling the watcher, polling continues, and a later `continue` automatically resumes without another Start, including a same-sequence terminal -> continue transition.

## Completed in This Task

- V02-001 through V02-004 remain verified and were not repeated.
- v0.2.3 explicit `Rerun 연결 프롬프트` onboarding remains implemented; the current project connection prompt already reconciled the existing run without resetting it.
- v0.2.4 changes `runtime.enabled` semantics to current-tab GitHub watcher on/off only.
- `background.js` no longer calls `stopSession()` merely because control is `complete`, `needs_user`, or `blocked`; it returns a wait action and keeps polling.
- When a terminal status is observed, the terminal sequence is armed by moving `lastHandledSequence` behind that sequence when safe. A later same-sequence `continue` is therefore treated as a fresh work authorization and can dispatch immediately instead of waiting for same-sequence retry delay.
- `max_runs`, `retry_limit`, and `sequence_regressed` now suppress dispatch with a wait result instead of automatically disabling the watcher.
- A new-chat handoff requested while GitHub is terminal now fails without disabling the existing watcher.
- Explicit browser-safety stops such as manual Stop, composer-not-empty protection, bootstrap send failure, handoff send failure, and resume prompt send failure remain stop conditions.
- Side Panel text now says `Watching GitHub` for an enabled watcher instead of `Running`.
- Side Panel adds a distinct `Tab watcher` row and renames the other row to `GitHub work status`; `continue` is rendered as `continue · start`.
- The single Start/Stop button remains, but its ARIA labels now explicitly say GitHub watcher.
- `tests/watcher-flow.test.mjs` was added for terminal-wait, same-sequence re-arm, wait-not-stop guards, and terminal-handoff behavior.
- `tests/popup-ui.test.mjs` was updated for watcher terminology and separate Tab watcher/GitHub status UI.
- `.chatgpt-rerun/README.md` and `docs/V02_E2E_TEST_PLAN.md` now define Chrome watcher state and GitHub work state as separate axes.
- Extension/package version is now `0.2.4`.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Existing v0.2 core browser evidence | prior dogfood | PASS | V02-001~004 remain verified. |
| v0.2.4 terminal wait code | GitHub remote source re-read | PASS | Terminal statuses return `wait`; no terminal `stopSession(tabId, control.status)` remains in the control action path. |
| v0.2.4 same-sequence re-arm code | GitHub remote source re-read | PASS | Terminal path moves `lastHandledSequence` behind the terminal sequence when safe, so later same-sequence `continue` is seen as fresh dispatch. |
| v0.2.4 watcher UI code | GitHub remote source re-read | PASS | Side Panel has `Tab watcher`, `GitHub work status`, `Watching GitHub`, and watcher-specific Start/Stop labels. |
| Automated regression tests committed | GitHub source | PASS | New watcher-flow test and updated popup UI test are present. |
| Full current `npm run check` | local checkout | NOT_RUN | Working container cannot resolve github.com/raw.githubusercontent.com to reconstruct the latest remote checkout. Do not claim full suite PASS. |
| Full current `npm test` | local checkout | NOT_RUN | Same environment limitation; tests are committed but not executed here. |
| Browser V02-007 watcher Start -> Stop -> Start | Chrome Side Panel | NOT_RUN | Requires v0.2.4 Reload. |
| Browser V02-006 terminal polling + automatic resume | Chrome + GitHub control | NOT_RUN | Requires v0.2.4 Reload. |
| Browser V02-008 connection prompt onboarding | separate safe project | NOT_RUN | Requires v0.2.4 Reload and a project whose repo is already known in the ChatGPT conversation. |

## Pending / Failed

- Reload the unpacked extension in `chrome://extensions` so local Chrome uses v0.2.4.
- Verify V02-007: Stopped shows Start; Start changes `Tab watcher` to Watching and button to Stop; Stop returns it to Stopped/Start. GitHub work status must remain a separate row.
- With watcher Watching and GitHub currently `needs_user`, confirm the watcher remains Watching rather than auto-stopping.
- For V02-006, after Reload place GitHub work state in a terminal status, wait at least one configured poll interval, and confirm polling continues with no new resume prompt.
- Change the same control sequence from terminal to `continue`; confirm the owning tab auto-resumes without pressing Start again and without waiting for retry delay.
- Also verify a new-sequence `continue` resumes normally and another stream watcher is unaffected.
- Then finish V02-008 on a separate safe project and resume remaining V02-005 evidence as needed.

## Files / Areas Touched

- `background.js`: terminal work states wait instead of stopping watcher; same-sequence re-arm; guard waits; terminal handoff no longer disables watcher.
- `popup.html`: watcher/GitHub-state explanation and separate runtime rows.
- `popup.js`: `Watching GitHub` presentation and watcher-specific Start/Stop semantics.
- `tests/watcher-flow.test.mjs`: new watcher-state regression guard.
- `tests/popup-ui.test.mjs`: watcher UI regression checks.
- `manifest.json`, `package.json`: version `0.2.4`.
- `.chatgpt-rerun/README.md`: protocol separation of watcher and GitHub work state.
- `docs/V02_E2E_TEST_PLAN.md`: V02-006/V02-007 updated for persistent watcher semantics.
- `.chatgpt-rerun/PLAN.md`: new acceptance criteria and decisions.

## Next Exact Action

User Reloads the unpacked extension from latest `agent/mvp-autoresume` at v0.2.4. In the current tab, while GitHub control is still `needs_user`, press Start and confirm the Side Panel shows `Tab watcher = Watching`, `GitHub work status = needs_user`, and the same button becomes Stop without an automatic resume prompt. Leave it Watching for at least one configured poll interval and confirm it remains Watching. Then report the observation before changing GitHub back to `continue` for the V02-006 auto-resume probe.

## Do Not Repeat

- Do not repeat V02-001 through V02-004.
- Do not rely on a pre-v0.2.4 loaded Side Panel for V02-006/V02-007 evidence.
- Do not interpret GitHub `complete`, `needs_user`, or `blocked` as a Chrome watcher Stop.
- Do not require a new Start after terminal -> continue; that transition is exactly what V02-006 must prove automatic.
- Do not create separate Start/Stop buttons again.
- Do not reset an existing active Rerun run during connection setup.
- Do not grant the Chrome extension GitHub write permission for onboarding.
- Do not automate ChatGPT app approval, OAuth authorization, or administrator-approval button clicks.
- Do not use STATUS to decide recovery, sequence, task, or terminal state.

## Blockers / User Decisions

- User action required: Reload the unpacked extension to v0.2.4 and perform the short watcher-state browser probe.
