# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `0`
- Desired control status: `needs_user`
- Current task: `V02-001`
- Control reason: `v0.2 per-tab runtime and new-chat handoff code is published; reload the unpacked extension before starting the new E2E run.`
- Phase: `awaiting_extension_reload`
- Last checkpoint (UTC): `2026-08-16T13:42:00Z`
- Current execution started (UTC): `2026-08-16T13:42:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:02:00Z`

## Current Objective

Pause the old dogfood automation, reload the local unpacked extension to the current `agent/mvp-autoresume` v0.2 head, then begin `docs/V02_E2E_TEST_PLAN.md` from V02-001.

## Completed in This Task

- Repository tree and existing runtime/UI/session code were re-read before the refactor.
- Global single-session storage was replaced with tab-specific config/runtime/draft storage keys.
- Side Panel opening was changed to tab-specific `chrome.sidePanel.setOptions({ tabId, ... })` + `open({ tabId })` behavior.
- Start/Stop and runtime polling now operate on the sender/current Chrome tab only.
- Same GitHub control stream collision guard was added to prevent duplicate sequence execution across tabs.
- `Continue in new chat` was added to open a fresh ChatGPT tab and transfer the GitHub-backed workflow.
- Handoff prompt includes owner/repo, branch, control path, run_id, and sequence, and instructs the new chat to recover from GitHub rather than prior conversation text.
- Handoff now pauses the old tab immediately with `handoffPending` to prevent duplicate sends during transfer.
- `docs/TAB_SESSIONS_AND_HANDOFF.md` and `docs/V02_E2E_TEST_PLAN.md` were added.

## Verification

| Check | Command | Result | Evidence / note |
|---|---|---|---|
| Syntax | `npm run check` | PASS | `background.js`, `content.js`, `control.js`, `popup.js` parse successfully. |
| Unit tests | `npm test` | PASS | 20/20 tests passed, including tab-key isolation and new-chat handoff prompt contents. |
| Manifest JSON | JSON parse | PASS | v0.2 manifest parsed successfully. |
| Real tab isolation | Chrome runtime observation | NOT_RUN | Requires extension Reload and two ChatGPT tabs. |
| Same-stream collision | Chrome runtime observation | NOT_RUN | Requires v0.2 live E2E. |
| New-chat handoff | Chrome runtime observation | NOT_RUN | Requires v0.2 live E2E. |

## Pending / Failed

- Local Chrome still needs to Reload the unpacked extension from the latest branch head.
- v0.1 dogfood run `...-02` was interrupted after E2E-002 because the runtime architecture changed; its unfinished E2E-003/004 are not valid v0.2 evidence.
- V02-001 through V02-006 have not yet been observed in the browser.

## Files / Areas Touched

- `control.js`: split config/runtime defaults, tab storage keys, new-chat handoff prompt builder.
- `background.js`: tab-scoped sessions, stream collision guard, tab-specific Side Panel, ownership handoff.
- `content.js`: idempotent injection, tab registration, direct handoff prompt send.
- `popup.js`: per-tab settings/draft/runtime and handoff action.
- `popup.html`, `popup.css`: tab identity and new-chat handoff UI.
- `manifest.json`, `package.json`: v0.2 / Chrome 116 minimum.
- `tests/control.test.mjs`: 20 tests.
- `docs/TAB_SESSIONS_AND_HANDOFF.md`, `docs/V02_E2E_TEST_PLAN.md`: v0.2 behavior and E2E plan.

## Next Exact Action

User reloads the unpacked extension in `chrome://extensions` from the latest `agent/mvp-autoresume` checkout and confirms Reload is complete. Then update PLAN/STATE/control from `needs_user` to `continue` for V02-001 and run the two-tab isolation probe.

## Do Not Repeat

- Do not continue the old `chatgpt-rerun-dogfood-20260816-02` E2E-003 state.
- Do not treat v0.1 E2E-003/004 as verified after this architecture refactor.
- Do not set control to `continue` before the user reloads the local v0.2 extension, or the old extension build may consume the new run.

## Blockers / User Decisions

- User action required: Reload the unpacked extension to the latest v0.2 code.
