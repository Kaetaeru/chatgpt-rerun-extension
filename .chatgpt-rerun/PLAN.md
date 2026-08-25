# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.18 with continuous work and fresh-chat recovery both intact. A normally completed Rerun response must clear same-sequence retry history, refresh GitHub control immediately, and continue without regular retry delay. If the current ChatGPT conversation can no longer provide a composer, Rerun must stop silently waiting and transfer watcher ownership to one fresh ChatGPT tab.

## Current identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Task: `V02-009`
- Desired control status while browser verification is pending: `needs_user`
- Extension version to verify: `0.2.18`

## Stable verified baseline

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation.
- [x] V02-002 same-stream collision guard.
- [x] V02-003 baseline new-sequence / guarded retry behavior.
- [x] V02-004 fresh-chat ownership transfer baseline.
- [x] V02-005 handoff race/failure safeguards to previously verified extent.
- [x] V02-006 watcher persistence across terminal GitHub work states.
- [x] V02-007 unified Start/Stop watcher toggle.
- [x] V02-008 unconnected-first onboarding.

Do not repeat V02-001 through V02-008 unless a current regression invalidates their evidence.

## V02-009 remaining acceptance

- [ ] Automatic dispatch inserts and submits the Rerun prompt.
- [ ] Normal completion resets `sameSequenceRetryCount` to 0 before the next prompt ACK.
- [ ] Normal completion refreshes GitHub once and refreshed `continue` chains without regular poll/retry delay.
- [ ] A missing current-chat composer does not silently loop; after a short render wait it attempts exactly one fresh-chat handoff.
- [ ] Fresh-chat ownership transfer copies the same repo/branch/control/run/sequence context and auto-submits the handoff prompt.
- [ ] A failed direct handoff does not recursively create more new chats; it safe-stops.
- [ ] User drafts remain protected.
- [ ] GitHub rate limit pauses polling without disabling the watcher and resumes automatically.
- [ ] Newer same-sequence `continue.updated_at` remains fresh authorization.
- [ ] No lifetime send-count gate blocks dispatch/claim/handoff.
- [ ] Approval-aware mode suppresses retry during GitHub confirmation, never clicks approval, and resumes after manual approval.
- [ ] Watchdog Stop re-arms abnormal recovery and does not freeze at `retry_limit`.
- [ ] Manual user Stop and watchdog Stop remain excluded from normal-completion fast chaining.
- [ ] Browser evidence for v0.2.18 is recorded.

## v0.2.18 design invariants

1. Normal successful execution is completion-driven, not retry-driven.
2. `sameSequenceRetryCount` represents unresolved abnormal retry state and is cleared on normal success; `runCount` remains lifetime telemetry.
3. When `POLL` returns `continue` and ChatGPT is idle, the current composer is used immediately if present.
4. If the composer is temporarily absent, content waits up to 5 seconds for SPA rendering before deciding the current conversation is not dispatchable.
5. If it remains absent, reuse the existing `HANDOFF_NEW_CHAT` path rather than adding a second handoff mechanism.
6. Only one fresh chat is opened by that handoff attempt. Direct handoff prompt failure stops the new watcher instead of recursively opening another tab.
7. Existing same-stream collision, user-draft, terminal-state, sequence-regression, rate-limit, approval, and watchdog guards remain intact.
8. Manual arbitrary new ChatGPT tabs remain unconnected unless watcher ownership is explicitly transferred; this fix concerns Rerun-owned recovery from a non-dispatchable current chat.

## Validation status

- v0.2.15 watchdog recovery re-arm: committed/source-verified.
- v0.2.16 immediate normal-completion chaining: committed/source-verified.
- v0.2.17 immediate successful-completion retry reset: committed/source-verified.
- v0.2.18 missing-composer fresh-chat recovery: committed/source-verified.
- `tests/content-send.test.mjs` includes a source regression assertion for the 5-second composer wait and fresh-chat handoff.
- Exact latest `npm run check` / `npm test`: **NOT_RUN**. Current execution environment cannot resolve `raw.githubusercontent.com`, so an exact remote checkout could not be materialized.
- Build: N/A; unpacked Manifest V3 extension.

## Current browser gate

1. Pull/reload unpacked ChatGPT Rerun **v0.2.18** in `chrome://extensions`.
2. Refresh the existing connected ChatGPT tab so the latest content script is active.
3. Keep `Kaetaeru/SimpleVTT @ work/v1-composite` watcher `Watching` when its control is intentionally `continue`.
4. Verify a normal response still resets Same-sequence retries to `0/N` and immediately chains.
5. Exercise a current-chat state where the composer is unavailable/exhausted.
6. Expected: Rerun waits up to 5 seconds for transient rendering; if composer is still absent, it opens one fresh ChatGPT tab, transfers watcher ownership, and auto-submits the GitHub-backed handoff prompt.
7. Verify the old tab becomes stopped/handed-off and the new tab remains Watching.
8. Verify handoff failure safe-stops rather than recursively opening tabs.
9. Record only observed browser evidence before marking V02-009 complete.

## Constraints

- Do not merge PR #1 unless explicitly requested.
- Do not auto-click ChatGPT app approval, GitHub OAuth/repository-access, or administrator approval UI.
- Do not parse assistant output text to infer completion or context limits.
- Do not reintroduce lifetime `Max sends`.
- Do not remove guarded abnormal retry behavior.
- One normal assistant execution still checkpoints around 18 minutes and ends before 20 minutes; 23 minutes remains recovery-only.
- Authoritative writes remain **PLAN -> STATE -> control.json**; STATUS is presentation-only.
