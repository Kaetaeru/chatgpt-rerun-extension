# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, human-readable STATUS, explicit unconnected-first project onboarding, and reliable automatic prompt submission.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified.
- [x] V02-004 `Continue in new chat` ownership transfer verified.
- [x] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [x] V02-006 persistent watcher across terminal GitHub work states verified.
- [x] V02-007 single state-driven Start/Stop watcher toggle verified.
- [x] V02-008 unconnected-first Rerun connection onboarding verified on a separate safe project.
- [ ] V02-009 injected resume prompt is automatically submitted without a manual Send/Enter action.
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
- `continue` is the GitHub work-start/resume signal; `complete`, `needs_user`, `blocked` pause dispatch but do not stop a watcher.
- Automatic Rerun dispatch means both composing the resume prompt and submitting it; leaving text in the composer for the user to send manually is a failure.
- Prompt submission must remain content-blind and must verify observable dispatch evidence before ACKing the sequence.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 targeted syntax: `node --check content.js` — PASS.
- v0.2.6 targeted auto-submit regression tests: `tests/content-send.test.mjs` — PASS, 4/4.
- Manual browser acceptance for v0.2.6: PENDING.
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
| V02-009 | in_progress | Reliable automatic prompt submission | A `continue` dispatch inserts the resume prompt and sends it automatically; no manual Send/Enter is required; ACK occurs only after composer-cleared or generation-start evidence |

## V02-009 implementation note

User observed on v0.2.5 that Start could insert the prompt into the ChatGPT composer without actually sending it. The previous `content.js` path waited 2.5 seconds for an enabled Send button and failed if the UI had not synchronized editor state in time.

v0.2.6 changes the submission path to:

1. inject prompt text;
2. dispatch explicit input/change synchronization, including after successful contenteditable `execCommand` insertion;
3. verify the prompt is actually present in the composer;
4. wait longer for an enabled Send button and click it when available;
5. if no enabled Send button appears, dispatch Enter as a fallback;
6. only treat submission as successful after observable dispatch evidence: composer cleared/disappeared or ChatGPT generation started.

A new `tests/content-send.test.mjs` covers these invariants and passes 4/4 in the targeted local reconstruction.

## Current gate

Reload the unpacked extension at v0.2.6. Then, with the tab watcher enabled and a safe `continue` work signal, confirm that the resume prompt is both inserted and automatically submitted. Do not require the user to click Send or press Enter.
