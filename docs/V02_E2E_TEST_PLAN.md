# ChatGPT Rerun v0.2.x E2E Test Plan

## Scope

Current verification target: **v0.2.16** on branch `agent/mvp-autoresume`.

Stable baseline remains V02-001 through V02-008. V02-009 covers the remaining browser/runtime reliability chain:

- automatic prompt submission;
- fresh-chat handoff and exhausted-chat recovery;
- GitHub REST rate-limit pause/resume;
- fresh same-sequence authorization;
- no lifetime send cap;
- approval-aware manual-confirmation resume;
- 23-minute stuck-generation recovery;
- **immediate normal-completion continuation**.

Version chain relevant to the current probe:

- v0.2.10: rate-limit-resilient polling; unauthenticated regular polling is deliberately conservative.
- v0.2.11: newer same-sequence `updated_at` is a fresh authorization.
- v0.2.12: removed lifetime `Max sends` gate.
- v0.2.13: suppress retry while a GitHub action-confirmation card is waiting; approval remains manual.
- v0.2.14: 23-active-minute watchdog can Stop a stuck Rerun-owned generation.
- v0.2.15: watchdog Stop re-arms stale pending/retry state so recovery cannot freeze at `retry_limit`.
- v0.2.16: a **normally completed** Rerun generation forces one immediate authoritative GitHub control refresh and, when the latest control is `continue`, submits the next prompt without waiting for regular polling or retry delay.

## Invariants

- One ChatGPT execution checkpoints around 18 minutes and ends before 20 minutes; 23 minutes is recovery-only.
- Normal completion is not a retry.
- `retryDelaySeconds` / `maxRetriesPerSequence` protect abnormal unchanged-generation recovery only.
- Manual user Stop is not normal completion and must not auto-chain immediately.
- Watchdog Stop is not normal completion; it follows its re-armed recovery path.
- Terminal `complete` / `needs_user` / `blocked` always pause implementation dispatch while leaving the watcher enabled.
- Sequence regression still blocks dispatch.
- A normal-completion refresh may bypass the local GitHub poll cache once, but it does not bypass an active server-side GitHub rate-limit pause.
- No app/OAuth/admin approval button is auto-clicked.
- Non-Rerun user composer content is never overwritten.

## V02-001 through V02-008

Retain previously verified evidence unless a current change directly invalidates it:

1. tab-scoped config/runtime isolation;
2. same-stream collision guard;
3. new-sequence and guarded retry behavior;
4. manual fresh-chat ownership transfer;
5. handoff race/failure safeguards;
6. watcher persistence across terminal GitHub work states;
7. unified Start/Stop watcher toggle;
8. unconnected-first explicit repository onboarding.

Do not repeat these probes merely because v0.2.16 was published.

## V02-009 A — Automatic submission

A valid `continue` must populate and actually submit the resume prompt without user Send/Enter. Paste-only is failure.

## V02-009 B — Fresh-chat recovery

Exhausted/stale Rerun prompt paths may transfer watcher ownership to one new ChatGPT tab. User drafts remain protected; recursive handoff is forbidden.

## V02-009 C — Rate-limit behavior

GitHub `403/429` rate limits pause polling while keeping the watcher enabled. Polling automatically resumes after the server-provided/reset delay.

## V02-009 D — Same-sequence authorization and unlimited workflow

A newer same-sequence `continue.updated_at` is fresh authorization. Historical `Sent` / `runCount` never blocks a valid authorization or handoff.

## V02-009 E — GitHub approval-aware resume

When enabled, a visible GitHub action-confirmation card suppresses Rerun polling/retry until the user manually approves. Rerun never clicks the approval control. After the card disappears, normal polling resumes automatically.

## V02-009 F — 23-minute stuck-generation watchdog

For a Rerun-owned generation only:

1. normal execution should finish before 20 minutes;
2. if generation remains active to 23 active minutes, click the visible/actionable ChatGPT Stop once;
3. exclude GitHub approval waiting time;
4. before the forced Stop, clear stale pending claim and reset same-sequence retry count;
5. after Stop, keep the watcher enabled and allow recovery;
6. never apply this watchdog to an unrelated manual ChatGPT generation.

## V02-009 G — Immediate normal-completion continuation

This is the current primary regression probe.

1. Reload unpacked extension **v0.2.16**.
2. Start/keep a watcher on a valid `continue` stream.
3. Let a Rerun-submitted ChatGPT response finish **normally**; do not click Stop.
4. Once the content script has observed an active Stop control, its disappearance must be recognized on the next base content tick (about 2 seconds), not after the 15-second startup grace.
5. The completion tick sends `POLL { afterGenerationComplete: true }`.
6. Background bypasses its normal local poll-cache interval exactly for that completion refresh and reads current GitHub control.
7. If the refreshed control is `continue` and not sequence-regressed, return a `normalContinuation` dispatch even if the unchanged-control retry delay/count would otherwise wait or be exhausted.
8. `CLAIM_SEQUENCE` for that normal continuation records `pendingIsRetry=false`; ACK therefore resets/keeps the retry counter at zero rather than consuming retry budget.
9. The next prompt must be automatically submitted without waiting 90/120 seconds.
10. If refreshed control is `complete`, `needs_user`, or `blocked`, do not submit another implementation prompt.
11. If the user manually clicks Stop, do not mark it normal completion and do not use this immediate chain path.
12. If the 23-minute watchdog clicks Stop, do not use the normal-completion path; use watchdog recovery instead.
13. A completion refresh response is consumed once so persistent GitHub errors cannot cause a 2-second API hammer loop.

### PASS-G

A normal Rerun response ends and, when GitHub still authorizes `continue`, the next Rerun prompt starts on the next completion cycle rather than after regular polling/retry delay. Terminal, manual-Stop, watchdog-Stop, rate-limit, and sequence-regression safety boundaries remain intact.

## Current browser gate

Use `Kaetaeru/SimpleVTT @ work/v1-composite` or another safe connected stream that can remain `continue` across two normal executions. Record only actually observed browser evidence.

## Pass criteria

V02-009 is complete only when the current extension has live evidence for the relevant dispatch/recovery paths. Source inspection or committed assertions are not browser PASS by themselves.
