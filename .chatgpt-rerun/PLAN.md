# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.17 with the original continuous-work UX restored: **after a Rerun-owned response finishes normally, clear same-sequence retry history immediately, refresh GitHub control once, and if the latest state is still `continue`, submit the next prompt without the regular poll interval or retry delay.**

Keep all previously added protections: tab isolation, fresh-chat recovery, rate-limit handling, unlimited lifetime sends, manual GitHub approval with approval-aware resume, and the 23-minute stuck-generation watchdog.

## Current identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Task: `V02-009`
- Desired control status while browser verification is pending: `needs_user`
- Extension version to verify: `0.2.17`

## Stable verified baseline

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation.
- [x] V02-002 same-stream collision guard.
- [x] V02-003 baseline new-sequence / guarded retry behavior.
- [x] V02-004 fresh-chat ownership transfer baseline.
- [x] V02-005 handoff race/failure safeguards to previously verified extent.
- [x] V02-006 watcher persistence across terminal GitHub work states.
- [x] V02-007 unified Start/Stop watcher toggle.
- [x] V02-008 unconnected-first onboarding.

Do not repeat V02-001 through V02-008 unless a new regression directly invalidates their evidence.

## V02-009 remaining acceptance

- [ ] Automatic dispatch inserts **and submits** the Rerun prompt.
- [ ] Exhausted/stale Rerun prompt recovery performs at most one safe fresh-chat handoff and preserves user drafts.
- [ ] GitHub rate limit pauses polling without disabling the watcher, then resumes automatically.
- [ ] Newer same-sequence `continue.updated_at` is fresh authorization.
- [ ] No lifetime send-count gate can block dispatch/claim/handoff.
- [ ] Approval-aware mode suppresses Rerun retry during GitHub confirmation, never clicks approval, and resumes after manual approval.
- [ ] Watchdog Stop re-arms same-sequence recovery rather than freezing at `retry_limit`.
- [ ] A Rerun-owned generation that remains active for 23 active minutes is force-stopped once; approval wait and unrelated manual responses are excluded.
- [ ] **Normal Rerun completion resets `sameSequenceRetryCount` to 0 immediately, before the next prompt is dispatched.**
- [ ] **The Side Panel therefore shows `Same-sequence retries = 0/N` after a successful completion, including when refreshed GitHub control is terminal and no next prompt is sent.**
- [ ] Normal Rerun completion immediately performs one authoritative GitHub control refresh.
- [ ] Refreshed `continue` dispatches the next prompt without waiting regular polling or `retryDelaySeconds`.
- [ ] Manual user Stop and watchdog Stop do not enter the normal-completion fast path.
- [ ] Terminal control and sequence regression still block immediate chaining.
- [ ] Browser evidence for v0.2.17 is recorded.

## v0.2.17 design invariants

1. Normal execution cadence is completion-driven, not retry-driven.
2. `sameSequenceRetryCount` represents unresolved abnormal retries for the current execution lineage; a successful normal response completion clears it immediately.
3. The retry counter reset does not wait for the next prompt ACK. This matters when refreshed control is `complete`, `needs_user`, or `blocked` and no next prompt is dispatched.
4. Normal completion does not clear the lifetime diagnostic `runCount` / `Sent` value.
5. `content.js` arms generation tracking only after actual Rerun dispatch evidence.
6. Once an active Stop control has been observed, disappearance marks completion on the next base content tick (about 2 seconds).
7. A trusted user click on Stop sets manual interruption and suppresses normal chaining/reset-as-success.
8. A watchdog programmatic Stop has `generationWatchdogFired=true` and follows its explicit recovery re-arm path instead of being classified as normal success.
9. Normal completion sends one `POLL { afterGenerationComplete: true }` after clearing retry history.
10. Background bypasses only its local poll cache for that one completion refresh; an active GitHub server-side rate-limit pause is still honored.
11. `complete`, `needs_user`, `blocked`, pending ownership, and sequence regression are checked before normal continuation.
12. Valid refreshed `continue` returns `normalContinuation=true` even if ordinary unchanged-generation retry delay/count would wait or be exhausted.
13. Normal-continuation claim uses `pendingIsRetry=false`; its ACK keeps the retry counter at zero.
14. Completion refresh is consumed after one background response so API errors cannot produce a 2-second GitHub hammer loop.
15. `retryDelaySeconds` / `maxRetriesPerSequence` remain abnormal-recovery safeguards only.

## Validation baseline

- v0.2.10 rate-limit resilience: committed; earlier browser rate-safe evidence retained.
- v0.2.11 fresh same-sequence authorization: committed; targeted decision probe previously passed.
- v0.2.12 lifetime send-cap removal: committed/source-verified.
- v0.2.13 approval-aware manual confirmation: committed/source-verified; live confirmation behavior still pending.
- v0.2.14 23-minute watchdog: committed/source-verified.
- v0.2.15 watchdog recovery re-arm: committed/source-verified.
- v0.2.16 immediate normal-completion chaining: committed/source-verified.
- v0.2.17 immediate successful-completion retry reset: committed/source-verified.
- `tests/content-send.test.mjs`: v0.2.17 source assertion requires `resetSameSequenceRetryCount()` before `normalContinuationPending=true`.
- Exact latest `npm run check` / `npm test`: **NOT_RUN**. This execution environment still cannot materialize the exact branch because GitHub DNS resolution fails (`Could not resolve host: raw.githubusercontent.com` / `github.com`).
- Build: N/A; unpacked Manifest V3 extension.

## Current browser gate

1. Pull/reload unpacked ChatGPT Rerun **v0.2.17** in `chrome://extensions`.
2. Return to a connected watcher, preferably `Kaetaeru/SimpleVTT @ work/v1-composite` when its control is intentionally `continue`.
3. Keep watcher `Watching`.
4. Let one Rerun response finish normally without clicking Stop.
5. Expected: `Same-sequence retries` resets to **`0/N` immediately after normal completion**, before/independent of the next prompt ACK.
6. Expected: after active Stop disappears, the same content cycle forces one GitHub control refresh; if latest control remains `continue`, the next prompt is automatically submitted without waiting 90/120 seconds.
7. Verify a terminal control leaves the retry counter at zero while preventing the next implementation prompt and keeping watcher Watching.
8. Verify manual Stop does not get classified as successful completion.
9. Verify controlled watchdog Stop recovers through its re-armed abnormal path, not the normal success path.
10. Record only actually observed live evidence before marking V02-009 complete.

## Constraints

- Do not merge PR #1 unless explicitly requested.
- Do not auto-click ChatGPT app approval, GitHub OAuth/repository-access, or administrator approval UI.
- Do not parse assistant output text to infer completion or context limits.
- Do not reintroduce lifetime `Max sends`.
- Do not remove guarded abnormal retry behavior.
- One normal assistant execution still checkpoints around 18 minutes and ends before 20 minutes; 23 minutes remains recovery-only.
- Authoritative writes remain **PLAN -> STATE -> control.json**; STATUS is presentation-only.
