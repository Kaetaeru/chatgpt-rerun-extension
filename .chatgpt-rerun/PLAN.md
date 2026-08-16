# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2/v0.2.1 after the session architecture changed from one browser-global runtime to independent per-tab runtimes, verify that a workflow can be handed off to a fresh ChatGPT conversation using GitHub as the only durable state source, and verify the simplified state-driven Start/Stop UX.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified after the refactor.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [ ] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [ ] V02-006 terminal state stops only the owning tab session.
- [ ] V02-007 single state-driven Start/Stop toggle verified.
- [ ] `docs/V02_E2E_TEST_PLAN.md` evidence is complete.
- [ ] No unresolved blocker remains.

## Constraints

- Follow `docs/V02_E2E_TEST_PLAN.md`.
- Previous v0.1 run evidence remains valid historical evidence, but its unfinished E2E-003/004 must not be treated as v0.2 PASS after the architecture refactor.
- Do not merge PR #1 as part of the automated run.
- State writes use PLAN -> STATE -> control.json ordering.
- One ChatGPT execution(turn) must end before the 20-minute hard stop; around 18 minutes checkpoint first and continue in the same sequence if unfinished.
- Do not parse assistant output to detect token/context-limit text. New-chat continuation is an explicit GitHub-backed handoff.
- Do not automate clicks on ChatGPT app approval, OAuth authorization, or administrator-approval UI. Repeated GitHub app-use approval is handled by ChatGPT app permissions where available.
- When code changes require an unpacked-extension Reload, stop the active dogfood run with `needs_user` before relying on the new behavior.

## Validation Baseline

- Syntax: `npm run check`
- Unit tests: `npm test`
- Manifest parse: JSON parse
- Manual E2E: `docs/V02_E2E_TEST_PLAN.md`
- Build: N/A (unpacked Manifest V3 extension)

## Tasks

| ID | Status | Depends on | Task | Acceptance criteria |
|---|---|---|---|---|
| V02-001 | verified | - | Reload v0.2 and verify tab-scoped Side Panel/config/runtime | Two ChatGPT tabs remain separated with independent tab-specific panel/config/draft/runtime; starting A does not start B |
| V02-002 | verified | V02-001 | Verify same-stream collision guard | Starting the same owner/repo/branch/control path in a second enabled tab is rejected without stopping the first |
| V02-003 | verified | V02-001 | Regression-test dispatch/retry under per-tab runtime | New sequence and same-sequence retry auto-send on the owning tab only; retry/run counters remain scoped to that tab |
| V02-004 | verified | V02-003 | Verify fresh-chat handoff | User-confirmed successful ownership transfer to a fresh ChatGPT conversation using the GitHub-backed handoff path |
| V02-005 | in_progress | V02-004 | Verify handoff race/failure safeguards | New owner receives the next sequence; successful handoff has no duplicate transfer; implementation/tests prove handoffPending suppression and deterministic failure cleanup to the extent safely reproducible |
| V02-006 | pending | V02-003 | Verify terminal isolation | complete/needs_user/blocked stops only the owning tab session |
| V02-007 | in_progress | V02-003 | Verify unified Start/Stop session control | Stopped shows only `Start`; clicking it starts the current tab and changes the same button to `Stop`; clicking `Stop` disables the current-tab session and changes the same button back to `Start` |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- v0.1 run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch and same-sequence retry before the v0.2 refactor.
- v0.2 stores config/runtime/draft under tab-specific Chrome storage keys.
- A same GitHub stream cannot be enabled in two tabs simultaneously.
- `Continue in new chat` opens a fresh ChatGPT tab and transfers ownership without incrementing the GitHub sequence solely because the conversation changed.
- New-chat handoff does not copy prior conversation text; it instructs the new chat to recover from GitHub.
- Current Run ID is `chatgpt-rerun-v02-20260816-01`.
- User confirmed the latest unpacked v0.2 extension Reload at 22:55 KST.
- V02-001 closed PASS at 23:01 KST after the user confirmed the two ChatGPT tabs remained properly separated.
- V02-002 closed PASS before 23:07 KST after tab B rejected Start on the already-owned GitHub stream with the expected error.
- V02-003 closed PASS at 23:09 KST: new-sequence auto-dispatch and same-sequence retry both occurred in tab A, while tab B still showed zero run/retry activity.
- V02-004 closed PASS at 23:17 KST after the user confirmed `Continue in new chat` completed successfully.
- The user's ChatGPT GitHub app permission was set to the persisted automatic-approval mode (`full_access`) to reduce repeated app-use approval prompts after fresh-chat handoff. This does not expand GitHub OAuth/repository scopes or bypass workspace/safety controls.
- At 23:21 KST the UX requirement changed: separate `Start this tab` and `Stop this tab` controls were replaced by one state-driven button. Extension/package version is now `0.2.1`.
- The single toggle reads the latest tab runtime before acting: stopped -> Start path, running -> Stop path. Runtime/storage refresh changes the same button label, styling, and ARIA state.
- `tests/popup-ui.test.mjs` was added to guard the single-toggle markup and both START/STOP message paths.
- Current gate is V02-007: Reload the unpacked 0.2.1 extension and verify the button flips `Start -> Stop -> Start`. After that, resume unfinished V02-005 and V02-006.
