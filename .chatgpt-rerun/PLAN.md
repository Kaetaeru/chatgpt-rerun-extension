# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, human-readable STATUS, and explicit project onboarding.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [x] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [x] V02-006 persistent watcher across terminal GitHub work states verified.
- [x] V02-007 single state-driven Start/Stop watcher toggle verified.
- [ ] V02-008 explicit Rerun connection-prompt onboarding verified on a separate safe project.
- [ ] `docs/V02_E2E_TEST_PLAN.md` evidence is complete.
- [ ] No unresolved blocker remains.

## Constraints

- Follow `docs/V02_E2E_TEST_PLAN.md`.
- Do not treat historical unfinished v0.1 evidence as current PASS.
- Do not merge PR #1 as part of the automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- Maintain `.chatgpt-rerun/STATUS.md` as presentation-only human status; never use it for reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output to detect context/token limits.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent of GitHub work status.
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause dispatch but do not stop a watcher.
- The primary new-project onboarding is explicit: `Rerun 연결 프롬프트` -> install/repair five files -> Start.
- The connection prompt must not guess between repositories and must preserve an existing active run.
- Automatic Start bootstrap remains only a fallback for the standard control path on a readable repo/branch.
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
| V02-008 | pending | V02-007 | Verify explicit Rerun connection onboarding | In a separate safe new project, one connection prompt identifies the known repo, creates/repairs README/PLAN/STATE/STATUS/control, publishes control last, stops before implementation, and later Start begins the first task |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / decisions

- Current Run ID: `chatgpt-rerun-v02-20260816-01`.
- V02-001~004 were verified in the original v0.2 browser dogfood.
- v0.2.1 unified Start/Stop into one state-driven control.
- v0.2.2 added safe missing-control bootstrap fallback.
- v0.2.3 added the explicit `Rerun 연결 프롬프트` onboarding path.
- v0.2.4 separated Chrome watcher state from GitHub work state.
- The current-project connection prompt was exercised successfully and preserved the existing active run; this is only partial V02-008 evidence.
- At `2026-08-16T15:18:00Z`, V02-006 was verified when same-seq `needs_user -> continue` auto-resumed without another Start.
- At `2026-08-16T15:20:00Z`, the user reported the explicit Stop -> Start watcher round-trip worked; V02-007 is verified.
- V02-005 is verified to the PLAN's stated extent safely reproducible: one successful live handoff plus direct source verification of all race/failure cleanup branches. Deliberately breaking a live handoff was not required.
- Full latest `npm run check` / `npm test` remain NOT_RUN because this environment cannot resolve `github.com` to reconstruct the latest branch checkout.

## Current gate

Only V02-008 remains as a browser acceptance item. It requires a separate safe project conversation with a clearly known GitHub repository and a clean/new Rerun setup path.