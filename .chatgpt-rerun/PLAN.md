# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, human-readable STATUS, and explicit **unconnected-first** project onboarding.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [x] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [x] V02-006 persistent watcher across terminal GitHub work states verified.
- [x] V02-007 single state-driven Start/Stop watcher toggle verified.
- [ ] V02-008 unconnected-first Rerun connection onboarding verified on a separate safe project.
- [ ] `docs/V02_E2E_TEST_PLAN.md` evidence is complete.
- [ ] No unresolved blocker remains.

## Constraints

- Follow `docs/V02_E2E_TEST_PLAN.md`.
- Do not merge PR #1 as part of the automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- Maintain `.chatgpt-rerun/STATUS.md` as presentation-only human status; never use it for reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output to detect context/token limits or to silently extract repository coordinates.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent of GitHub work status.
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause dispatch but do not stop a watcher.
- A new ChatGPT tab must start with repository connection `Unconnected`; unrelated tab/legacy repository coordinates must not be inherited.
- The connection prompt must identify a repository only from GitHub app/tool usage that actually occurred in the current conversation. Side Panel values and mere text mentions are not identification evidence.
- If the current conversation has no actually used GitHub repository, connection prompt must report `RERUN_CONNECTION: UNCONNECTED` and write no files.
- If repository/branch selection is ambiguous, connection prompt must report `RERUN_CONNECTION: AMBIGUOUS` and write no files.
- When one repository/branch is confirmed, the connection prompt may install/repair the five Rerun files and must report `RERUN_CONNECTION: CONNECTED` with owner/repo, canonical URL, branch/ref, control path, run/sequence/status/task and project goal.
- The extension intentionally does not parse that assistant result; the user confirms it and stores Owner/Repository/Branch in the Side Panel before Start.
- Automatic Start bootstrap remains only a fallback for a directly entered standard control path on a readable repo/branch.
- Rerun repository writes are performed through ChatGPT's connected GitHub app, not by granting the extension contents-write permission.
- V02-008 must use a separate safe project; never delete an existing project's Rerun state to manufacture evidence.

## Validation baseline

- Syntax: `npm run check`
- Unit tests: `npm test`
- Manifest parse: JSON parse
- Manual E2E: `docs/V02_E2E_TEST_PLAN.md`
- Build: N/A (unpacked Manifest V3 extension)

## Tasks

| ID | Status | Depends on | Task | Acceptance criteria |
|---|---|---|---|---|
| V02-001 | verified | - | Verify tab-scoped Side Panel/config/runtime | Two ChatGPT tabs keep independent panel/config/draft/runtime |
| V02-002 | verified | V02-001 | Verify same-stream collision guard | Second watcher on same owner/repo/branch/control is rejected |
| V02-003 | verified | V02-001 | Regression-test dispatch/retry | New sequence and same-sequence retry auto-send only on owning tab; counters remain tab-scoped |
| V02-004 | verified | V02-003 | Verify fresh-chat handoff | Ownership transfers once to a fresh ChatGPT conversation using GitHub state |
| V02-005 | verified | V02-004 | Verify handoff race/failure safeguards | Live successful handoff plus source-verified handoffPending suppression, pre-transfer cleanup, post-transfer `handoff_send_failed`, and terminal refusal without watcher shutdown |
| V02-006 | verified | V02-003 | Verify persistent watcher across GitHub work states | `needs_user` pauses dispatch while watcher stays Watching; same-seq `continue` auto-resumes without another Start |
| V02-007 | verified | V02-003 | Verify unified Start/Stop watcher control | User confirmed `Stop -> Stopped/Start -> Start -> Watching/Stop` while GitHub work status remained separate |
| V02-008 | pending | V02-007 | Verify unconnected-first explicit Rerun onboarding | New tab is Unconnected; first prompt before GitHub use reports UNCONNECTED/no writes; after actual repo use a second prompt reports CONNECTED, installs five files with control last, ends before implementation, and Start begins first task after user stores reported coordinates |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / decisions

- Current Run ID: `chatgpt-rerun-v02-20260816-01`.
- V02-001~007 are verified.
- v0.2.1 unified Start/Stop into one state-driven control.
- v0.2.2 added safe missing-control bootstrap fallback.
- v0.2.3 added the explicit connection prompt.
- v0.2.4 separated Chrome watcher state from GitHub work state.
- v0.2.5 makes repository connection explicit and unconnected-first: `DEFAULT_CONFIG.branch` starts empty, new tabs do not copy unrelated legacy repo config, Side Panel shows `Repository connection = Unconnected`, and connection prompt ignores Side Panel coordinates.
- v0.2.5 connection result states are `UNCONNECTED`, `AMBIGUOUS`, and `CONNECTED`; CONNECTED reports the full user-confirmable repository/run coordinates.
- The current-project connection prompt previously exercised active-run preservation, but the final V02-008 acceptance is now the stricter unconnected-first path and must be re-run on a separate safe project.
- Full latest `npm run check` / `npm test` remain NOT_RUN because this environment cannot fetch a complete latest checkout from github.com. Targeted source/test files were updated but must not be called fully executed.

## Current gate

Reload the unpacked extension at v0.2.5, then perform V02-008 A/B on a separate safe project exactly as written in `docs/V02_E2E_TEST_PLAN.md`.