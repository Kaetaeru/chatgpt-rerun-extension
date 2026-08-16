# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, explicit unconnected-first onboarding, reliable automatic prompt submission, automatic exhausted-chat recovery, and rate-limit-resilient GitHub polling.

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
- [ ] V02-009 exhausted/stale-Rerun-prompt path transfers watcher to one fresh chat while user drafts remain protected.
- [ ] V02-009 fresh-chat handoff auto-submits and works under both `continue` and terminal GitHub work states.
- [ ] V02-009 GitHub REST rate limits pause polling without stopping the watcher, then auto-resume.
- [ ] V02-009 browser evidence is recorded.
- [ ] No unresolved blocker remains.

## Constraints / invariants

- Do not merge PR #1 as part of this automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- `.chatgpt-rerun/STATUS.md` is presentation-only and never participates in reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- Do not parse assistant output or limit-message text to detect context/token limits.
- Do not automate ChatGPT app approval, OAuth, or administrator-approval clicks.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent from GitHub work status.
- `continue` is work start/resume; `complete`, `needs_user`, `blocked` pause implementation dispatch but do not stop a watcher.
- GitHub REST `403/429` rate limiting is also not a watcher Stop. Respect GitHub reset/retry timing and keep the watcher enabled.
- Unauthenticated polling must reserve headroom below GitHub's public REST quota and share that budget across enabled unauthenticated watchers.
- Authenticated polling may run at the existing 5-second minimum and should retain conditional ETag requests.
- Automatic dispatch means compose + actual submit; leaving text in the composer is failure.
- A non-empty composer is protected unless its normalized text exactly equals the current configured Rerun resume prompt.
- Automatic fresh-chat recovery must not recursively open new tabs after a direct handoff prompt fails.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 targeted auto-submit tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 browser probe exposed stale-prompt guard regression.
- v0.2.9 stale Rerun prompt ownership fix: source/regression assertions committed; browser probe was then blocked by GitHub public API rate limiting.
- v0.2.10 rate-limit resilience implementation and tests: COMMITTED.
- v0.2.10 browser UI load: PASS (`Public · rate-safe` observed by user).
- v0.2.10 exact full npm suite: NOT_RUN in this environment.
- Build: N/A (unpacked Manifest V3 extension).

## Tasks

| ID | Status | Task | Acceptance evidence |
|---|---|---|---|
| V02-001 | verified | Tab-scoped Side Panel/config/runtime | Two ChatGPT tabs kept independent state |
| V02-002 | verified | Same-stream collision guard | Duplicate watcher Start was rejected |
| V02-003 | verified | Dispatch/retry regression | New/same-sequence dispatch worked on owning tab only |
| V02-004 | verified | Fresh-chat handoff baseline | User-confirmed GitHub-backed ownership transfer |
| V02-005 | verified | Handoff race/failure safeguards | Live success + source-verified suppression/cleanup paths |
| V02-006 | verified | Persistent watcher across GitHub work states | `needs_user` kept watcher Watching; later `continue` auto-resumed |
| V02-007 | verified | Unified Start/Stop watcher | User-confirmed Stop -> Start round trip |
| V02-008 | verified | Unconnected-first explicit onboarding | User completed separate-project onboarding probe |
| V02-009 | in_progress | Reliable auto-submit + fresh-chat recovery + rate-limit-resilient polling | v0.2.10 loaded; re-arming live `continue` probe now |

## V02-009 latest browser finding

The user reported `API polling = Public · rate-safe` but no work started. The extension was not actually blocked by the public API mode. The authoritative control was still `needs_user`, which intentionally suppresses resume dispatch while leaving the tab watcher active.

`Public · rate-safe` therefore means only: no token is configured and the watcher will use the conservative unauthenticated polling interval. It is not a work-start signal.

## Current gate

The v0.2.10 reload gate is satisfied by the user's `Public · rate-safe` observation. Re-arm the existing sequence 9 from terminal `needs_user` to `continue` while the watcher remains enabled. Expected: no additional Start click is required; the watcher sees terminal -> continue as fresh authorization and automatically submits the resume prompt. On the exhausted/stale-prompt chat, the expected next behavior is a one-time fresh ChatGPT tab handoff and ownership transfer.
