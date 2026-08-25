# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.16 with the original continuous-work UX restored: **after a Rerun-owned response finishes normally, immediately refresh GitHub control once and, if the latest state is still `continue`, submit the next prompt without the regular poll interval or retry delay.**

Keep all previously added protections: tab isolation, fresh-chat recovery, rate-limit handling, unlimited lifetime sends, manual GitHub approval with approval-aware resume, and the 23-minute stuck-generation watchdog.

## Current identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Task: `V02-009`
- Desired control status while browser verification is pending: `needs_user`
- Extension version to verify: `0.2.16`

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
- [ ] **Normal Rerun completion immediately performs one authoritative GitHub control refresh.**
- [ ] **Refreshed `continue` dispatches the next prompt without waiting regular polling or `retryDelaySeconds`.**
- [ ] Manual user Stop and watchdog Stop do not enter the normal-completion fast path.
- [ ] Terminal control and sequence regression still block immediate chaining.
- [ ] Browser evidence for v0.2.16 is recorded.

## v0.2.16 design invariants

1. Normal execution cadence is completion-driven, not retry-driven.
2. `content.js` arms generation tracking only after actual Rerun dispatch evidence.
3. Once an active Stop control has been observed, disappearance marks completion on the next base content tick (about 2 seconds).
4. A trusted user click on Stop sets manual interruption and suppresses normal chaining.
5. A watchdog programmatic Stop has `generationWatchdogFired=true` and suppresses normal chaining.
6. Normal completion sends one `POLL { afterGenerationComplete: true }`.
7. Background bypasses only its local poll cache for that one completion refresh; an active GitHub server-side rate-limit pause is still honored.
8. `complete`, `needs_user`, `blocked`, pending ownership, and sequence regression are checked before normal continuation.
9. Valid refreshed `continue` returns `normalContinuation=true` even if ordinary unchanged-generation retry delay/count would wait or be exhausted.
10. Normal-continuation claim uses `pendingIsRetry=false`; ACK therefore does not consume retry budget.
11. Completion refresh is consumed after one background response so API errors cannot produce a 2-second GitHub hammer loop.
12. `retryDelaySeconds` / `maxRetriesPerSequence` remain abnormal-recovery safeguards only.

## Validation baseline

- v0.2.10 rate-limit resilience: committed; earlier browser rate-safe evidence retained.
- v0.2.11 fresh same-sequence authorization: committed; targeted decision probe previously passed.
- v0.2.12 lifetime send-cap removal: committed/source-verified.
- v0.2.13 approval-aware manual confirmation: committed/source-verified; live confirmation behavior still pending.
- v0.2.14 23-minute watchdog: committed/source-verified.
- v0.2.15 watchdog recovery re-arm: committed/source-verified.
- v0.2.16 immediate normal-completion chaining: committed/source-verified.
- `tests/content-send.test.mjs` and `tests/watcher-flow.test.mjs`: v0.2.16 source regression assertions committed.
- Exact latest `npm run check` / `npm test`: **NOT_RUN**. This execution environment could not materialize the exact branch because `github.com` DNS resolution failed (`Could not resolve host: github.com`).
- Build: N/A; unpacked Manifest V3 extension.

## Current browser gate

1. Reload unpacked ChatGPT Rerun **v0.2.16** in `chrome://extensions`.
2. Return to a connected watcher, preferably `Kaetaeru/SimpleVTT @ work/v1-composite` when its control is intentionally `continue`.
3. Keep watcher `Watching`.
4. Let one Rerun response finish normally without clicking Stop.
5. Expected: after active Stop disappears, the next content tick forces one GitHub control refresh; if latest control remains `continue`, the next prompt is automatically submitted immediately instead of waiting 90/120 seconds.
6. Verify terminal control prevents the next implementation prompt while watcher stays Watching.
7. Verify manual Stop does not immediately auto-chain.
8. Verify controlled watchdog Stop recovers through the re-armed abnormal path, not the normal fast path.
9. Record only actually observed live evidence before marking V02-009 complete.

## Constraints

- Do not merge PR #1 unless explicitly requested.
- Do not auto-click ChatGPT app approval, GitHub OAuth/repository-access, or administrator approval UI.
- Do not parse assistant output text to infer completion or context limits.
- Do not reintroduce lifetime `Max sends`.
- Do not remove guarded abnormal retry behavior.
- One normal assistant execution still checkpoints around 18 minutes and ends before 20 minutes; 23 minutes remains recovery-only.
- Authoritative writes remain **PLAN -> STATE -> control.json**; STATUS is presentation-only.
