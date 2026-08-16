# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, human-readable STATUS, explicit unconnected-first project onboarding, reliable automatic prompt submission, and status-independent fresh-chat watcher transfer.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified.
- [x] V02-004 `Continue in new chat` ownership transfer baseline verified.
- [x] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [x] V02-006 persistent watcher across terminal GitHub work states verified.
- [x] V02-007 single state-driven Start/Stop watcher toggle verified.
- [x] V02-008 unconnected-first Rerun connection onboarding verified on a separate safe project.
- [ ] V02-009 current-tab resume prompt is automatically submitted without manual Send/Enter.
- [ ] V02-009 fresh-chat handoff auto-submits its prompt and works under both `continue` and terminal GitHub work states.
- [ ] V02-009 browser evidence is recorded.
- [ ] No unresolved blocker remains.

## Constraints / invariants

- Do not merge PR #1 as part of this automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- `.chatgpt-rerun/STATUS.md` is presentation-only and is never used for reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output to detect context/token limits or silently extract repository coordinates.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent of GitHub work status.
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause implementation dispatch but do not stop a watcher.
- `Continue in new chat` transfers watcher ownership and must not be blocked solely because GitHub work status is terminal.
- Terminal fresh-chat handoff restores repo/run context but must not start implementation; the new watcher keeps polling and later `continue` auto-resumes.
- Automatic dispatch means both composing the prompt and submitting it; leaving text in the composer is failure.
- Prompt submission remains content-blind and requires observable dispatch evidence before sequence ACK.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 auto-submit targeted syntax/tests: PASS, 4/4.
- v0.2.7 handoff status-aware prompt targeted check: PASS.
- v0.2.7 browser acceptance: PENDING.
- Build: N/A (unpacked Manifest V3 extension).

## Tasks

| ID | Status | Task | Acceptance evidence |
|---|---|---|---|
| V02-001 | verified | Tab-scoped Side Panel/config/runtime | Two ChatGPT tabs kept independent state |
| V02-002 | verified | Same-stream collision guard | Duplicate watcher Start was rejected |
| V02-003 | verified | Dispatch/retry regression | New sequence + same-sequence retry worked on owning tab only |
| V02-004 | verified | Fresh-chat handoff baseline | User-confirmed GitHub-backed ownership transfer |
| V02-005 | verified | Handoff race/failure safeguards | Live success + source-verified suppression/cleanup/failure paths |
| V02-006 | verified | Persistent watcher across GitHub work states | `needs_user` kept watcher Watching; same-seq `continue` auto-resumed without another Start |
| V02-007 | verified | Unified Start/Stop watcher | User-confirmed Stop -> Start round trip |
| V02-008 | verified | Unconnected-first explicit onboarding | User completed final separate-project onboarding probe successfully |
| V02-009 | in_progress | Reliable auto-submit + status-independent fresh-chat handoff | Current tab auto-submits; new-chat handoff auto-submits; terminal handoff transfers watcher/context and later `continue` auto-resumes |

## V02-009 implementation notes

v0.2.6 fixed the observed prompt-inserted-but-not-submitted regression by synchronizing editor input state, waiting longer for Send, falling back to Enter, and requiring dispatch evidence before ACK.

The user then reported that automatic restart in a new chat was not working. Inspection found a separate stale rule in `background.js`: `Continue in new chat` rejected any control whose status was not `continue`, even though v0.2.4 had already defined watcher state as independent from GitHub work status.

v0.2.7 fixes that mismatch:

1. fresh-chat handoff no longer rejects `complete`, `needs_user`, or `blocked` solely because of status;
2. ownership still moves old tab -> new tab exactly once;
3. handoff prompt now includes run_id, sequence, status, task_id;
4. `continue` handoff resumes work from GitHub STATE;
5. terminal handoff restores context only, starts no implementation, and keeps the new watcher polling;
6. later `continue` is auto-dispatched in the new tab without another Start;
7. v0.2.6 robust direct-prompt submission path is also used by `RERUN_HANDOFF`.

## Current gate

Reload the unpacked extension at v0.2.7, then run the V02-009 browser probes in `docs/V02_E2E_TEST_PLAN.md`. Current GitHub work state must stay `needs_user` until Reload is confirmed.
