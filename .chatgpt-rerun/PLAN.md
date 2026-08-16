# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the session architecture changed from one browser-global runtime to independent per-tab runtimes, verify fresh-chat GitHub-backed handoff, the state-driven Start/Stop UX, human-readable live STATUS, and a project-onboarding flow where ChatGPT can explicitly install Rerun state into the GitHub repository already known in the current conversation.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified after the refactor.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [ ] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [ ] V02-006 terminal state stops only the owning tab session.
- [ ] V02-007 single state-driven Start/Stop toggle verified.
- [ ] V02-008 explicit Rerun connection-prompt onboarding verified on a separate safe project.
- [ ] `docs/V02_E2E_TEST_PLAN.md` evidence is complete.
- [ ] No unresolved blocker remains.

## Constraints

- Follow `docs/V02_E2E_TEST_PLAN.md`.
- Previous v0.1 run evidence remains valid historical evidence, but its unfinished E2E-003/004 must not be treated as v0.2 PASS after the architecture refactor.
- Do not merge PR #1 as part of the automated run.
- Authoritative state writes use PLAN -> STATE -> control.json ordering; control is the last authoritative write.
- Maintain `.chatgpt-rerun/STATUS.md` as a human-readable presentation-only dashboard. Refresh on meaningful state changes and target a safe checkpoint within about five minutes during long active executions. Never use STATUS for reconciliation.
- One ChatGPT execution(turn) must end before the 20-minute hard stop; around 18 minutes checkpoint first and continue in the same sequence if unfinished.
- Do not parse assistant output to detect token/context-limit text. New-chat continuation is an explicit GitHub-backed handoff.
- Do not automate clicks on ChatGPT app approval, OAuth authorization, or administrator-approval UI. Repeated GitHub app-use approval is handled by ChatGPT app permissions where available.
- When code changes require an unpacked-extension Reload, stop the active dogfood run with `needs_user` before relying on the new behavior.
- The primary new-project onboarding is explicit: while Stopped, press `Rerun 연결 프롬프트`, let ChatGPT identify the GitHub repository already known in the conversation and create/repair the five standard files, then configure/confirm owner/repo/branch and press Start.
- The connection prompt must not guess between multiple repository candidates and must not reset or overwrite an existing active Rerun run.
- v0.2.2 automatic Start bootstrap remains only as a safety fallback for the standard `.chatgpt-rerun/control.json` path on a readable repo/branch.
- Bootstrap/connection GitHub writes are performed by the connected ChatGPT GitHub app, not by granting the Chrome extension contents-write permission.
- V02-008 must use a separate safe test project; never delete an existing project's Rerun files merely to manufacture onboarding evidence.

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
| V02-008 | pending | V02-007 | Verify explicit Rerun connection prompt onboarding | While Stopped, one `Rerun 연결 프롬프트` sends a direct setup prompt that identifies the repository from current conversation GitHub context, refuses ambiguity, creates/repairs README/PLAN/STATE/STATUS/control without resetting an active run, publishes new-project control last, stops before implementation, and leaves Start to begin the first task |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- v0.1 run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch and same-sequence retry before the v0.2 refactor.
- v0.2 stores config/runtime/draft under tab-specific Chrome storage keys.
- A same GitHub stream cannot be enabled in two tabs simultaneously.
- `Continue in new chat` opens a fresh ChatGPT tab and transfers ownership without incrementing the GitHub sequence solely because the conversation changed.
- New-chat handoff does not copy prior conversation text; it instructs the new chat to recover from GitHub.
- Current Run ID is `chatgpt-rerun-v02-20260816-01`.
- User confirmed the initial unpacked v0.2 extension Reload at 22:55 KST.
- V02-001 closed PASS at 23:01 KST after the user confirmed the two ChatGPT tabs remained properly separated.
- V02-002 closed PASS before 23:07 KST after tab B rejected Start on the already-owned GitHub stream with the expected error.
- V02-003 closed PASS at 23:09 KST: new-sequence auto-dispatch and same-sequence retry both occurred in tab A, while tab B still showed zero run/retry activity.
- V02-004 closed PASS at 23:17 KST after the user confirmed `Continue in new chat` completed successfully.
- The user's ChatGPT GitHub app permission was set to the persisted automatic-approval mode (`full_access`) to reduce repeated app-use approval prompts after fresh-chat handoff. This does not expand GitHub OAuth/repository scopes or bypass workspace/safety controls.
- At 23:21 KST separate `Start this tab` / `Stop this tab` controls were replaced by one runtime-driven session toggle.
- At 23:30 KST a human-readable `.chatgpt-rerun/STATUS.md` dashboard was added as a presentation-only five-file protocol component.
- v0.2.2 added safe automatic missing-control bootstrap as a Start fallback.
- At 23:51 KST the onboarding requirement was refined: projects normally already have a GitHub repository and the current ChatGPT conversation already knows which repo it is using. v0.2.3 therefore adds a dedicated `Rerun 연결 프롬프트` button as the primary setup path.
- The connection button does not enable the Rerun runtime. It directly sends `RERUN_CONNECT` to the current ChatGPT tab while Stopped, using Side Panel repository coordinates only as an optional hint.
- `buildRerunConnectionPrompt()` instructs ChatGPT to identify the repository from current conversation GitHub context, ask rather than guess if ambiguous, create or safely repair README/PLAN/STATE/STATUS/control, preserve active run state, publish new-project control last, and end before the first implementation task.
- The connection button is disabled whenever the current-tab Rerun runtime is enabled, preventing accidental re-initialization in the middle of an active run.
- v0.2.2 Start bootstrap remains a fallback if the explicit connection step is skipped; it is no longer the recommended onboarding UX.
- Extension/package version is now `0.2.3`.
- Current gate remains V02-007: Reload the unpacked v0.2.3 extension and verify `Start -> Stop -> Start`. Then perform V02-008 connection-prompt onboarding on a separate safe project before resuming V02-005/V02-006.
