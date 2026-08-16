# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, human-readable STATUS, explicit unconnected-first project onboarding, reliable automatic prompt submission, and automatic fresh-chat recovery when an exhausted current chat cannot dispatch.

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
- [ ] V02-009 confirmed current-chat dispatch failure automatically transfers the watcher to a fresh chat instead of immediately stopping.
- [ ] V02-009 fresh-chat handoff auto-submits its prompt and works under both `continue` and terminal GitHub work states.
- [ ] V02-009 browser evidence is recorded.
- [ ] No unresolved blocker remains.

## Constraints / invariants

- Do not merge PR #1 as part of this automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- `.chatgpt-rerun/STATUS.md` is presentation-only and is never used for reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output or limit-message text to detect context/token limits.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent of GitHub work status.
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause implementation dispatch but do not stop a watcher.
- `Continue in new chat` transfers watcher ownership and must not be blocked solely because GitHub work status is terminal.
- Terminal fresh-chat handoff restores repo/run context but must not start implementation; the new watcher keeps polling and later `continue` auto-resumes.
- Automatic dispatch means both composing the prompt and submitting it; leaving text in the composer is failure.
- A confirmed dispatch failure means the extension inserted the prompt, tried Send/Enter, and still observed no composer-clear or generation-start evidence.
- Only that confirmed watcher-dispatch failure may trigger automatic fresh-chat handoff; generic content-script errors still safe-stop.
- Prompt submission remains content-blind and requires observable dispatch evidence before sequence ACK.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 auto-submit targeted syntax/tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 exhausted-chat auto-handoff implementation + regression tests: COMMITTED, browser PENDING.
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
| V02-009 | in_progress | Reliable auto-submit + automatic exhausted-chat handoff | Normal dispatch auto-submits; confirmed dispatch failure opens a fresh chat and transfers watcher ownership; fresh chat resumes or waits according to GitHub status |

## V02-009 implementation notes

v0.2.6 fixed the observed prompt-inserted-but-not-submitted regression by synchronizing editor input state, waiting longer for Send, falling back to Enter, and requiring dispatch evidence before ACK.

v0.2.7 removed the stale rule that blocked `Continue in new chat` under terminal GitHub states and made the handoff prompt status-aware.

The user then tested Start on a chat that had reached its usable conversation limit. The watcher briefly enabled, attempted the current `continue` dispatch, failed to produce dispatch evidence, and the old `content.js` catch path unconditionally called `STOP_SESSION`. That made the button immediately return to Start.

v0.2.8 changes this failure path:

1. release the claimed sequence first;
2. classify only errors beginning `prompt inserted but ...` as confirmed dispatch failures;
3. resolve the current Chrome tab ID through the existing `REGISTER_CHAT_TAB` response;
4. invoke the existing `HANDOFF_NEW_CHAT` path automatically;
5. if handoff succeeds, old-tab watcher ownership transfers to the new chat instead of stopping;
6. if handoff itself fails, safe-stop with `auto_handoff_failed`;
7. other send/composer failures still safe-stop and do not open surprise tabs;
8. direct `RERUN_HANDOFF` submission failure on the fresh chat does not recursively open more chats.

This does not scrape assistant output or look for a limit message. It relies only on observable failure to dispatch an extension-injected resume prompt.

## Current gate

Reload the unpacked extension at v0.2.8. On the exhausted test chat with a valid `continue` control, press Start. Expected behavior: the old tab may briefly become Watching, the failed dispatch triggers one fresh ChatGPT tab, watcher ownership transfers, and the fresh-chat handoff prompt is automatically submitted. The old tab must not simply fall back to Start unless the handoff itself fails.
