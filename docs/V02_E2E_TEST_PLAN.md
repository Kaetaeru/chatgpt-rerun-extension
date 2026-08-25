# ChatGPT Rerun v0.2.x E2E Test Plan

## Scope

Current verification target: **v0.2.18** on branch `agent/mvp-autoresume`.

Stable baseline remains V02-001 through V02-008. V02-009 covers automatic submission, fresh-chat recovery, rate-limit resilience, same-sequence authorization, unlimited lifetime sends, approval-aware manual confirmation, stuck-generation recovery, immediate normal chaining, retry-reset semantics, and exhausted-chat handoff.

Relevant version chain:

- v0.2.10: rate-limit-resilient polling.
- v0.2.11: newer same-sequence `updated_at` is fresh authorization.
- v0.2.12: removed lifetime `Max sends` gate.
- v0.2.13: approval-aware wait; approval remains manual.
- v0.2.14: 23-minute stuck-generation watchdog.
- v0.2.15: watchdog Stop re-arms pending/retry state.
- v0.2.16: normal completion forces one immediate GitHub refresh and valid `continue` chains without normal retry delay.
- v0.2.17: successful completion clears `sameSequenceRetryCount` immediately.
- v0.2.18: a valid `continue` with no current-chat composer waits briefly for SPA rendering, then reuses the existing one-shot fresh-chat handoff instead of silently waiting forever.

## Invariants

- One ChatGPT execution checkpoints around 18 minutes and ends before 20 minutes; 23 minutes is recovery-only.
- Normal completion is not a retry and clears unresolved same-sequence retry history.
- `retryDelaySeconds` / `maxRetriesPerSequence` protect abnormal recovery only.
- Manual user Stop and watchdog Stop are not normal completion.
- Terminal `complete` / `needs_user` / `blocked` pause implementation dispatch while watcher stays enabled.
- Sequence regression remains blocked.
- Server-side GitHub rate-limit pauses are never bypassed.
- No app/OAuth/admin approval button is auto-clicked.
- Non-Rerun user composer content is never overwritten.
- Fresh-chat recovery may open at most one new tab per handoff attempt; direct handoff failure must safe-stop rather than recurse.

## V02-001 through V02-008

Retain previously verified evidence unless a current regression directly invalidates it:

1. tab-scoped config/runtime isolation;
2. same-stream collision guard;
3. new-sequence and guarded retry behavior;
4. manual fresh-chat ownership transfer;
5. handoff race/failure safeguards;
6. watcher persistence across terminal GitHub work states;
7. unified Start/Stop watcher toggle;
8. unconnected-first repository onboarding.

## V02-009 primary probes

### A. Automatic submission

A valid `continue` must populate and actually submit the resume prompt without user Send/Enter.

### B. Fresh-chat ownership transfer

A manual or automatic handoff opens one fresh ChatGPT tab, copies watcher ownership/context, auto-submits the GitHub-backed handoff prompt, disables the old watcher, and does not recurse if direct handoff submission fails.

### C. Rate-limit behavior

GitHub `403/429` pauses polling without disabling watcher ownership. Polling resumes automatically after the server-provided/reset delay.

### D. Same-sequence authorization and unlimited workflow

Newer same-sequence `continue.updated_at` is fresh authorization. Historical `Sent` / `runCount` never blocks a valid authorization or handoff.

### E. GitHub approval-aware resume

A visible GitHub action-confirmation card suppresses Rerun polling/retry until the user manually approves. Rerun never clicks the approval control.

### F. 23-minute stuck-generation watchdog

For Rerun-owned generations only, a generation still active at 23 active minutes receives one Stop after approval-wait time is excluded. Pending/retry recovery is re-armed first.

### G. Immediate normal-completion continuation and retry reset

1. Let a Rerun-owned response finish normally.
2. `Same-sequence retries` becomes `0/N` immediately.
3. Completion triggers one authoritative GitHub refresh.
4. Latest valid `continue` dispatches the next prompt without the ordinary 90/120-second polling/retry delays.
5. Terminal state, manual Stop, watchdog Stop, sequence regression, and active GitHub rate-limit pause still block the fast path as appropriate.

### H. Missing-composer exhausted-chat recovery — v0.2.18

1. Use a watcher whose GitHub state is valid `continue`.
2. Put the current ChatGPT conversation in a state where it is idle but no usable composer is available.
3. Rerun must first wait up to 5 seconds for transient SPA rendering.
4. If a composer appears, use it normally and do not hand off.
5. If it remains absent, call the existing `HANDOFF_NEW_CHAT` path instead of silently returning.
6. Exactly one fresh ChatGPT tab should open.
7. The new tab should inherit repo/branch/control/run/sequence watcher ownership and receive an automatically submitted handoff prompt.
8. The old tab should become handed-off/stopped.
9. If direct handoff submission fails, safe-stop; do not recursively open another tab.

### PASS-H

A non-dispatchable/exhausted current conversation no longer remains indefinitely `Watching` with no work. It either regains its composer within the short render grace or transfers to one fresh ChatGPT conversation and continues from GitHub state.

## Current browser gate

Use `Kaetaeru/SimpleVTT @ work/v1-composite` or another safe connected stream. Reload v0.2.18, refresh the current ChatGPT tab, retain watcher ownership, and record only actually observed browser evidence.

## Pass criteria

V02-009 is complete only when the current extension has live browser evidence for the relevant dispatch/recovery paths. Source inspection or committed assertions are not browser PASS by themselves.
