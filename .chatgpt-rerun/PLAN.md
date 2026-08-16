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
- [x] V02-008 unconnected-first Rerun connection onboarding verified on a separate safe project.
- [x] `docs/V02_E2E_TEST_PLAN.md` evidence is complete.
- [x] Latest v0.2.5 `npm run check` passes.
- [x] Latest v0.2.5 `npm test` passes: 38/38.
- [x] Manifest/package JSON parse passes.
- [x] No unresolved blocker remains.

## Constraints / invariants

- Do not merge PR #1 as part of this automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- `.chatgpt-rerun/STATUS.md` is presentation-only and is never used for reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output to detect context/token limits or silently extract repository coordinates.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent of GitHub work status.
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause dispatch but do not stop a watcher.
- A new ChatGPT tab starts repository connection `Unconnected`; unrelated repo coordinates are not inherited.
- Connection discovery uses actual GitHub app/tool usage in the current conversation, not Side Panel hints or mere text mentions.
- No actual repo -> `RERUN_CONNECTION: UNCONNECTED` and no writes.
- Ambiguous repo/branch -> `RERUN_CONNECTION: AMBIGUOUS` and no writes.
- One confirmed repo/branch -> install/repair five Rerun files and report `RERUN_CONNECTION: CONNECTED` with user-confirmable coordinates and run state.
- Extension remains content-blind and does not parse the CONNECTED answer to auto-fill repository coordinates.
- Automatic Start bootstrap remains a fallback for an explicitly entered readable repo/branch with the standard control path.

## Validation baseline

- Syntax: `npm run check` — PASS on latest v0.2.5 source.
- Unit/regression tests: `npm test` — PASS, 38/38.
- Manifest/package parse — PASS.
- Manual E2E: `docs/V02_E2E_TEST_PLAN.md` — PASS.
- Build: N/A (unpacked Manifest V3 extension).

## Tasks

| ID | Status | Task | Acceptance evidence |
|---|---|---|---|
| V02-001 | verified | Tab-scoped Side Panel/config/runtime | Two ChatGPT tabs kept independent state |
| V02-002 | verified | Same-stream collision guard | Duplicate watcher Start was rejected |
| V02-003 | verified | Dispatch/retry regression | New sequence + same-sequence retry worked on owning tab only |
| V02-004 | verified | Fresh-chat handoff | User-confirmed GitHub-backed ownership transfer |
| V02-005 | verified | Handoff race/failure safeguards | Live success + source-verified suppression/cleanup/failure paths |
| V02-006 | verified | Persistent watcher across GitHub work states | `needs_user` kept watcher Watching; same-seq `continue` auto-resumed without another Start |
| V02-007 | verified | Unified Start/Stop watcher | User-confirmed Stop -> Start round trip |
| V02-008 | verified | Unconnected-first explicit onboarding | User completed final separate-project v0.2.5 onboarding probe successfully |

## Final notes

- Current Run ID: `chatgpt-rerun-v02-20260816-01`.
- Extension/package version: `0.2.5`.
- Full final suite initially exposed one stale test assertion in `tests/bootstrap-flow.test.mjs`; product code was correct. The assertion was updated to the current three-direct-prompt `includes(...)` contract, then the entire suite passed 38/38.
- Final V02-008 user observation: `다 됐어.` after the requested unconnected-first onboarding sequence.
- `docs/V02_E2E_RESULT.md` contains the complete final evidence summary.

## Completion

All defined acceptance criteria are verified. The dogfood run is ready to publish the next authoritative state as `complete`.
