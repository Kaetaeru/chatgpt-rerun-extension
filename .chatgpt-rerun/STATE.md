# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `5`
- Desired control status: `needs_user`
- Current task: `V02-007`
- Control reason: `v0.2.1 replaces separate Start/Stop controls with one state-driven toggle; reload the unpacked extension before browser verification.`
- Phase: `awaiting_extension_reload_for_toggle_ux`
- Last checkpoint (UTC): `2026-08-16T14:30:00Z`
- Current execution started (UTC): `2026-08-16T14:30:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:50:00Z`

## Current Objective

Verify V02-007: after Reloading the unpacked extension at v0.2.1, the Side Panel must expose exactly one session control. When the current tab is stopped it says `Start`; clicking it starts only that tab and changes the same button to `Stop`; clicking `Stop` disables the current-tab Rerun and changes the same button back to `Start`.

The user also requested a GitHub-readable live progress view. That protocol-level feature is now implemented without changing the current browser gate: `.chatgpt-rerun/STATUS.md` is a human-readable presentation-only dashboard refreshed on meaningful changes and at roughly five-minute safe checkpoints during long active executions.

## Completed in This Task

- V02-001 through V02-004 remain verified.
- V02-005 had begun after successful fresh-chat handoff but is temporarily paused for the user-requested UX change.
- Separate footer buttons `Start this tab` and `Stop this tab` were removed from `popup.html`.
- A single `sessionToggle` button was added; its visible label is `Start` while stopped and `Stop` while running.
- `popup.js` now reads the latest tab runtime at click time and sends `START_TAB_SESSION` or `STOP_TAB_SESSION` from the same control.
- Runtime/storage refresh updates the same button label, primary/danger styling, `aria-pressed`, and `aria-label` from `runtime.enabled`.
- Footer layout was simplified to Save + session toggle.
- Extension and package version were bumped from `0.2.0` to `0.2.1`.
- `tests/popup-ui.test.mjs` was added to ensure there is exactly one session-toggle control and both Start/Stop message paths remain present.
- The actual remote `popup.js`, `popup.html`, and new test were copied into the local validation container after GitHub clone was unavailable in that environment.
- `.chatgpt-rerun/STATUS.md` was added for the current run with a user-readable summary of run/task/progress/recent verification/user action/next action/blockers.
- `templates/repository/.chatgpt-rerun/STATUS.md` was added so new Rerun-enabled repositories get the same dashboard.
- Active and template `.chatgpt-rerun/README.md` contracts now require STATUS freshness while explicitly forbidding its use for reconciliation.
- `docs/PROJECT_PROTOCOL.md` was upgraded to the five-file standard and documents presentation-only STATUS writes after the last authoritative `control.json` write.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| New popup JS syntax | `node --check popup.js` against remote file contents | PASS | v0.2.1 `popup.js` parsed successfully. |
| Single-toggle regression test | `node --test tests/popup-ui.test.mjs` against remote file contents | PASS | 1/1; asserts `sessionToggle`, no separate `start`/`stop` IDs, and both START/STOP message paths. |
| Existing v0.2 protocol/static baseline | prior validation | PASS | Core background/content/control code was not changed by this UX patch. |
| Live STATUS current-run file | GitHub file creation/read contract | PASS | `.chatgpt-rerun/STATUS.md` exists and describes the current needs_user/V02-007 gate. |
| Reusable STATUS template | GitHub template file | PASS | `templates/repository/.chatgpt-rerun/STATUS.md` exists. |
| STATUS protocol rules | active/template README + `docs/PROJECT_PROTOCOL.md` | PASS | Human-only role, ~5-minute active freshness target, state-change refresh, no reconciliation, control-last-authoritative semantics documented. |
| Browser V02-007 stopped state | Chrome Side Panel observation | NOT_RUN | Requires unpacked-extension Reload to v0.2.1. |
| Browser V02-007 Start -> Stop | Chrome Side Panel observation | NOT_RUN | Reload, click Start, verify Running and same button becomes Stop. |
| Browser V02-007 Stop -> Start | Chrome Side Panel observation | NOT_RUN | Click Stop, verify Stopped/manual and same button becomes Start. |
| V02-005 new-owner continuity/race safeguards | Chrome/runtime evidence | IN_PROGRESS | Resume after V02-007 browser verification. |

## Pending / Failed

- Reload the unpacked extension in `chrome://extensions` so local Chrome uses v0.2.1.
- Open the ChatGPT Rerun Side Panel for the current tab and verify there is one session button, not separate Start/Stop buttons.
- With the session stopped, confirm the button says `Start`.
- Click `Start`; confirm the tab becomes Running and the same button changes to `Stop`.
- Click `Stop`; confirm the tab becomes Stopped with manual stop semantics and the same button changes back to `Start`.
- Record V02-007 evidence, then resume V02-005 and V02-006.
- On every subsequent execution, keep STATUS current under the new freshness rules without using it as source of truth.

## Files / Areas Touched

- `popup.html`: one `sessionToggle` button replaces separate Start/Stop controls.
- `popup.js`: state-driven toggle action and rendering.
- `popup.css`: two-column footer and disabled-button treatment.
- `tests/popup-ui.test.mjs`: UI regression guard.
- `manifest.json`, `package.json`: version `0.2.1`.
- `.chatgpt-rerun/STATUS.md`: current human-readable live dashboard.
- `.chatgpt-rerun/README.md`: active STATUS freshness/presentation-only contract.
- `.chatgpt-rerun/PLAN.md`: STATUS maintenance constraint and decision note.
- `templates/repository/.chatgpt-rerun/STATUS.md`: reusable dashboard template.
- `templates/repository/.chatgpt-rerun/README.md`: reusable STATUS maintenance contract.
- `docs/PROJECT_PROTOCOL.md`: standard directory and execution transaction updated for STATUS.
- `.chatgpt-rerun/STATE.md`: current Reload/browser-verification checkpoint plus dashboard implementation evidence.

## Next Exact Action

User Reloads the unpacked extension from the latest `agent/mvp-autoresume` checkout. Then inspect the current tab Side Panel: verify the stopped state shows exactly one `Start` control, click it and verify the same control becomes `Stop` while Running, click `Stop` and verify it becomes `Start` while Stopped. Report the observed result. After V02-007 is verified, restore the active run to `continue` and resume V02-005 from the successful fresh-chat handoff checkpoint. Keep STATUS synchronized with those visible state changes.

## Do Not Repeat

- Do not repeat V02-001 through V02-004.
- Do not rely on the locally loaded 0.2.0 Side Panel to verify V02-007.
- Do not create separate Start/Stop controls again; runtime state must drive one control.
- Do not resume V02-005 automatic progression until the user has Reloaded 0.2.1.
- Do not automate ChatGPT app approval, OAuth authorization, or administrator-approval button clicks in the extension.
- Do not use STATUS to decide recovery, sequence, task, or terminal state.

## Blockers / User Decisions

- User action required: Reload the unpacked extension to v0.2.1 and perform the short Start -> Stop -> Start UI probe.
