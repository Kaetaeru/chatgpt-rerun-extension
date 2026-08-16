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
- [ ] V02-009 an exhausted chat with a stale Rerun-owned prompt automatically transfers the watcher to a fresh chat.
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
- Automatic dispatch means both composing the prompt and submitting it; leaving text in the composer is failure.
- A non-empty composer is protected as a user draft unless its normalized text exactly matches the resume prompt Rerun is currently trying to dispatch.
- An exact Rerun-owned stale prompt may trigger fresh-chat handoff without being mistaken for a user draft.
- Confirmed post-insertion dispatch failure and prompt/editor synchronization failure may trigger one automatic fresh-chat handoff; direct fresh-chat handoff submission itself must not recurse.
- Prompt submission remains content-blind and requires observable dispatch evidence before sequence ACK.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 auto-submit targeted syntax/tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 exhausted-chat auto-handoff implementation: browser probe exposed stale-prompt guard regression.
- v0.2.9 stale Rerun prompt ownership fix + regression assertions: COMMITTED, browser PENDING.
- Latest exact full npm suite after v0.2.9: NOT_RUN in this environment.
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
| V02-009 | in_progress | Reliable auto-submit + automatic exhausted-chat handoff | Stale Rerun prompt is recognized as extension-owned, user drafts remain protected, and exhausted chats transfer to one fresh tab |

## V02-009 implementation notes

v0.2.6 fixed the original prompt-inserted-but-not-submitted regression. v0.2.7 made fresh-chat handoff independent from GitHub terminal work state. v0.2.8 attempted automatic handoff after a confirmed failed watcher dispatch.

The v0.2.8 browser probe exposed an earlier guard that ran before auto-handoff: a failed Rerun prompt could remain in the composer, and the next Start treated any non-empty composer as a user draft. `composer_not_empty` therefore stopped the watcher immediately before the automatic handoff path was reached.

v0.2.9 changes this safely:

1. read the existing composer text before claiming the sequence;
2. normalize whitespace and compare it with the exact current Rerun resume prompt;
3. if non-empty text differs, retain the existing `composer_not_empty` user-draft safety stop;
4. if it matches exactly, treat it as a stale Rerun-owned prompt and immediately attempt `HANDOFF_NEW_CHAT`;
5. if the stale-prompt handoff fails, safe-stop with `auto_handoff_failed` and preserve the concrete error;
6. prompt/editor synchronization failure is also eligible for the same one-shot handoff fallback;
7. no assistant output or limit-warning text is parsed.

## Current gate

Reload the unpacked extension at v0.2.9. Use the same exhausted chat with the stale Rerun resume prompt still present if possible. With a valid `continue` control, Start should no longer return immediately to Start because of `composer_not_empty`; it should open one fresh ChatGPT tab and transfer watcher ownership. If any different user-authored text is in the composer, Rerun must still Stop instead of overwriting it.
