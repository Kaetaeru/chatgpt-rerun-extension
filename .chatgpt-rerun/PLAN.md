# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, explicit unconnected-first onboarding, reliable automatic prompt submission, automatic exhausted-chat recovery, rate-limit-resilient GitHub polling, and durable multi-execution continuation within one task sequence.

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
- `sequence` identifies the durable task/checkpoint stream; it is not a one-shot execution id.
- Within the same sequence, a `continue` whose `updated_at` is newer than the watcher's `lastSentAt` is a fresh authorization generation, not an unchanged-control retry.
- Retry delay/count limits apply only while the exact same control generation remains unchanged after a send.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 targeted auto-submit tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 browser probe exposed stale-prompt guard regression.
- v0.2.9 stale Rerun prompt ownership fix: source/regression assertions committed; browser probe was then blocked by GitHub public API rate limiting.
- v0.2.10 rate-limit resilience implementation and tests: COMMITTED.
- v0.2.10 browser UI load: PASS (`Public · rate-safe` observed by user).
- v0.2.11 same-sequence authorization-generation fix: COMMITTED.
- v0.2.11 targeted decision probe: PASS — rewritten same sequence dispatches as non-retry even at retry count 2; unchanged same generation still returns `retry_limit`.
- v0.2.11 exact full npm suite: NOT_RUN because this environment cannot resolve github.com for a fresh checkout and no Actions workflow exists for this extension repo.
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
| V02-009 | in_progress | Reliable auto-submit + fresh-chat recovery + rate-limit-resilient polling + long same-sequence continuation | v0.2.11 browser verification pending |

## V02-009 latest browser finding — SimpleVTT

The user clarified that the no-dispatch observation occurred on `Kaetaeru/SimpleVTT`, not on the Rerun extension's own dogfood tab.

Direct GitHub inspection showed SimpleVTT is correctly armed:

- repository/branch: `Kaetaeru/SimpleVTT` / `main`
- run_id: `b7f27a61-29d8-4ba2-9f93-8e66722d5f41`
- sequence: `1`
- status: `continue`
- task_id: `phase14-production-play-session-ux`
- STATE and PLAN explicitly require continued work on the same sequence from the durable checkpoint.

SimpleVTT has also published multiple new checkpoint/continue control writes while intentionally preserving sequence 1. The v0.2.10 extension only compared sequence against `lastHandledSequence`. Once the same-sequence retry counter reached its default limit of 2, `continuationDisposition()` returned `retry_limit` forever, even when a later ChatGPT execution rewrote control with a newer `updated_at` to authorize more work.

That explains the observed UI: `Public · rate-safe` and watcher activity can coexist with no dispatch because the internal reason was `retry_limit`, which the current Side Panel does not surface.

## v0.2.11 fix

`continuationDisposition()` now compares `control.updatedAt` with the existing runtime `lastSentAt` after confirming the sequence is unchanged.

- Same sequence + control `updated_at` newer than `lastSentAt` -> `{ action: "send", isRetry: false }`.
- Same sequence + same/older control generation -> existing retry delay/count behavior remains.
- Therefore a durable task may span arbitrarily many deliberate control rewrites without spending the retry budget, while a stuck unchanged control still cannot generate an unbounded send loop.

The regression test explicitly verifies a same-sequence control rewritten after the last send still dispatches even when `sameSequenceRetryCount === maxRetriesPerSequence`, and the unchanged-generation test still verifies `retry_limit`.

## Current gate

Reload unpacked ChatGPT Rerun **v0.2.11**. On the existing SimpleVTT tab, keep the connection on `Kaetaeru/SimpleVTT @ main` and watcher enabled. Because the current SimpleVTT control generation (`updated_at=2026-08-17T03:51:00+09:00`) is newer than the prior stopped/retry-limited execution, the next successful control poll should classify it as fresh authorization and submit the resume prompt without changing SimpleVTT's sequence.

If the current ChatGPT conversation is exhausted, the subsequent dispatch-failure path should still transfer to one fresh chat as specified by the existing v0.2.9/v0.2.10 handoff behavior.
