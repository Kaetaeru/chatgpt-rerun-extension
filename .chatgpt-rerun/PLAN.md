# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, explicit unconnected-first onboarding, reliable automatic prompt submission, automatic exhausted-chat recovery, rate-limit-resilient GitHub polling, durable multi-execution continuation within one task sequence, and **no lifetime send cap for deliberate fresh authorizations**.

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
- [ ] V02-009 a freshly rewritten `continue` control with the same sequence is treated as new authorization even after the unchanged-generation retry limit was reached.
- [ ] V02-009 lifetime `Max sends` does not block current-tab dispatch, sequence claim, or fresh-chat handoff; `Sent` remains diagnostic only.
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
- GitHub REST `403/429` rate limiting is not a watcher Stop. Respect reset/retry timing and keep the watcher enabled.
- Unauthenticated polling reserves headroom below GitHub's public REST quota and shares that budget across enabled unauthenticated watchers.
- Authenticated polling may run at the existing 5-second minimum and retains conditional ETag requests.
- Automatic dispatch means compose + actual submit; leaving text in the composer is failure.
- A non-empty composer is protected unless its normalized text exactly equals the current configured Rerun resume prompt.
- Automatic fresh-chat recovery must not recursively open new tabs after a direct handoff prompt fails.
- `sequence` identifies the durable task/checkpoint stream; it is not a one-shot execution id.
- Within the same sequence, a `continue` whose `updated_at` is newer than the watcher's `lastSentAt` is a fresh authorization generation, not an unchanged-control retry.
- Retry delay/count limits apply only while the exact same control generation remains unchanged after a send.
- **There is no lifetime send-count safety gate.** `runCount`/`Sent` may increase without bound for diagnostics and must never suppress a valid fresh authorization or handoff.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 targeted auto-submit tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 browser probe exposed stale-prompt guard regression.
- v0.2.9 stale Rerun prompt ownership fix: source/regression assertions committed; browser probe was then blocked by GitHub public API rate limiting.
- v0.2.10 rate-limit resilience implementation and tests: COMMITTED; browser UI load PASS (`Public · rate-safe`).
- v0.2.11 same-sequence authorization-generation fix: COMMITTED; targeted decision probe PASS.
- v0.2.12 lifetime send-cap removal: COMMITTED. `background.js` no longer contains `max_runs`, `normalizeMaxRuns`, or `Max sends` blocking paths; Side Panel no longer exposes the Max sends setting; legacy values are compatibility-only and normalize to an unbounded sentinel if older UI/storage code touches them.
- v0.2.12 regression assertions: COMMITTED in `tests/control.test.mjs`, `tests/watcher-flow.test.mjs`, and `tests/popup-ui.test.mjs`.
- v0.2.12 exact full npm suite: NOT_RUN because this runtime cannot resolve github.com for a fresh checkout.
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
| V02-009 | in_progress | Reliable auto-submit + fresh-chat recovery + rate-limit resilience + unlimited deliberate continuations | v0.2.12 browser verification pending |

## SimpleVTT live diagnosis

The actual failing project is `Kaetaeru/SimpleVTT @ main`. Its authoritative Rerun coordination is healthy: run_id `b7f27a61-29d8-4ba2-9f93-8e66722d5f41`, sequence `1`, status `continue`, task `phase14-production-play-session-ux`. STATE/PLAN require continued work on the same sequence.

SimpleVTT's Phase 14 history contains at least twenty deliberate continuation authorizations within the same run. v0.2.11 fixed fresh same-sequence generations being mistaken for retries, but `background.js` still checked `runCount >= maxRuns` before the generation logic and also blocked claim/handoff. With the default `Max sends=20`, the watcher could therefore show `Watching` / `Public · rate-safe` while silently returning `wait: max_runs`.

## v0.2.12 fix

- Removed the lifetime `max_runs` gate from normal control dispatch.
- Removed the lifetime `max_runs` gate from `CLAIM_SEQUENCE`.
- Removed the lifetime `Max sends` rejection from fresh-chat handoff.
- `Sent` / `runCount` remains a diagnostic counter only.
- Side Panel no longer exposes `Max sends` as a user setting and explicitly explains that total send count is unlimited.
- Legacy stored `maxRuns` values remain parse-compatible but cannot stop dispatch.
- Per-generation `Retries / sequence` remains the duplicate/stuck-control safety mechanism.

## Current gate

Reload unpacked ChatGPT Rerun **v0.2.12**. Return to the existing SimpleVTT ChatGPT tab connected to `Kaetaeru/SimpleVTT @ main` and keep/turn the watcher on. Do not change SimpleVTT's run or sequence. Expected after the next successful control fetch: the current sequence 1 `continue` can dispatch regardless of historical `Sent` count. If the current conversation is exhausted, fresh-chat handoff must also be allowed regardless of historical `Sent` count.
