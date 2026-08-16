# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the session architecture changed from one browser-global runtime to independent per-tab runtimes, verify fresh-chat GitHub-backed handoff, the tab-watcher Start/Stop UX, human-readable live STATUS, explicit project onboarding, and the separation between persistent Chrome watcher state and GitHub work state.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified after the refactor.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [ ] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [ ] V02-006 persistent watcher across terminal GitHub work states verified.
- [ ] V02-007 single state-driven Start/Stop watcher toggle verified.
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
- When code changes require an unpacked-extension Reload, keep GitHub work state at `needs_user` before relying on the new behavior.
- `runtime.enabled` is the current-tab GitHub watcher on/off state. It must not be set false merely because GitHub control is `complete`, `needs_user`, or `blocked`.
- `continue` is the GitHub work-start/resume signal. Terminal GitHub statuses pause dispatch but the watcher continues polling at the configured interval.
- A terminal -> `continue` transition must be able to resume automatically without the user pressing Start again, including a same-sequence transition.
- Max sends, retry limit, and sequence regression may suppress dispatch but should not by themselves disable the watcher; explicit browser-safety stops remain allowed.
- The primary new-project onboarding is explicit: while the watcher is Stopped, press `Rerun 연결 프롬프트`, let ChatGPT identify the GitHub repository already known in the conversation and create/repair the five standard files, then configure/confirm owner/repo/branch and press Start.
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
| V02-001 | verified | - | Reload v0.2 and verify tab-scoped Side Panel/config/runtime | Two ChatGPT tabs remain separated with independent tab-specific panel/config/draft/runtime; starting watcher A does not start watcher B |
| V02-002 | verified | V02-001 | Verify same-stream collision guard | Starting the same owner/repo/branch/control path in a second enabled watcher is rejected without stopping the first |
| V02-003 | verified | V02-001 | Regression-test dispatch/retry under per-tab runtime | New sequence and same-sequence retry auto-send on the owning tab only; retry/run counters remain scoped to that tab |
| V02-004 | verified | V02-003 | Verify fresh-chat handoff | User-confirmed successful watcher ownership transfer to a fresh ChatGPT conversation using the GitHub-backed handoff path |
| V02-005 | in_progress | V02-004 | Verify handoff race/failure safeguards | New owner receives the next sequence; successful handoff has no duplicate transfer; terminal handoff refusal does not stop the existing watcher; failure cleanup remains deterministic |
| V02-006 | in_progress | V02-003 | Verify persistent watcher across GitHub work states | complete/needs_user/blocked pauses dispatch but watcher stays Watching and polls; later continue, including same sequence, auto-resumes without another Start |
| V02-007 | in_progress | V02-003 | Verify unified Start/Stop watcher control | Stopped shows only `Start`; clicking it turns on current-tab watcher and changes the same button to `Stop`; clicking `Stop` disables only the current-tab watcher and changes the same button back to `Start`; GitHub work status is shown separately |
| V02-008 | pending | V02-007 | Verify explicit Rerun connection prompt onboarding | While watcher is Stopped, one `Rerun 연결 프롬프트` sends a direct setup prompt that identifies the repository from current conversation GitHub context, refuses ambiguity, creates/repairs README/PLAN/STATE/STATUS/control without resetting an active run, publishes new-project control last, stops before implementation, and leaves Start to enable the watcher and begin the first task |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- v0.1 run `chatgpt-rerun-dogfood-20260816-02` verified initial dispatch and same-sequence retry before the v0.2 refactor.
- v0.2 stores config/runtime/draft under tab-specific Chrome storage keys.
- A same GitHub stream cannot be watched by two tabs simultaneously.
- `Continue in new chat` opens a fresh ChatGPT tab and transfers watcher ownership without incrementing the GitHub sequence solely because the conversation changed.
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
- At 23:51 KST v0.2.3 added the dedicated `Rerun 연결 프롬프트` button as the primary setup path.
- The current-project connection prompt was exercised and reconciled the existing active run without resetting run_id/sequence/task; this is partial V02-008 evidence but not the separate-new-project acceptance case.
- At 00:02 KST the watcher model changed: Chrome Start/Stop now controls only whether the current tab keeps polling GitHub. GitHub `continue/complete/needs_user/blocked` controls work dispatch independently.
- v0.2.4 keeps the watcher enabled on terminal GitHub statuses, arms a terminal sequence so a later same-sequence `continue` is treated as a fresh work authorization, and changes max-runs/retry-limit/sequence-regression handling from watcher Stop to watcher Wait.
- The Side Panel now displays `Tab watcher` separately from `GitHub work status`; `continue` is shown as `continue · start`.
- At 00:15 KST on Aug 17, while control remained seq 5 / `needs_user`, the user reported `워칭으로 나와.`. This confirms the v0.2.4 watcher remained enabled under a terminal GitHub work state.
- The next probe intentionally changes the same seq 5 from `needs_user` to `continue` without another Start. Automatic resume in the already-Watching tab is required for the key V02-006 acceptance path.
- Extension/package version is now `0.2.4`.
