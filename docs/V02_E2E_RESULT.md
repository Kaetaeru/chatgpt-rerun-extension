# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.14`
- Status: `V02_009_LIVE_VERIFY`
- Current task: `V02-009`

## Stable verified baseline

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User-confirmed tab isolation. |
| V02-002 same-stream collision guard | PASS | Duplicate watcher Start rejected. |
| V02-003 dispatch/retry regression | PASS | New/same-sequence dispatch worked on owning tab only. |
| V02-004 fresh-chat handoff baseline | PASS | Earlier live ownership transfer succeeded. |
| V02-005 handoff race/failure safeguards | PASS | Live success + source-verified suppression/cleanup paths. |
| V02-006 persistent watcher | PASS | `needs_user` kept watcher Watching; later same-seq `continue` auto-resumed. |
| V02-007 Start/Stop watcher | PASS | User-confirmed Stop -> Start round trip. |
| V02-008 unconnected-first onboarding | PASS | User completed the separate-project onboarding probe. |

## V02-009 regression chain

1. v0.2.5: resume prompt could be inserted without being submitted.
2. v0.2.6: composer synchronization, Send/Enter fallback, and dispatch-evidence checks added.
3. v0.2.7: fresh-chat handoff decoupled from terminal GitHub work status.
4. v0.2.8: failed current-chat dispatch attempted automatic fresh-chat handoff.
5. v0.2.9: a stale Rerun-owned prompt left in the composer no longer looks like a user draft and can route to handoff.
6. A browser probe hit the GitHub public REST rate limit.
7. v0.2.10 added rate-limit-safe polling and pause/resume behavior.
8. SimpleVTT exposed same-sequence long-task `retry_limit` behavior.
9. v0.2.11 made newer same-sequence `updated_at` a fresh authorization.
10. SimpleVTT still stopped after many successful continuations because lifetime `Max sends=20` remained.
11. v0.2.12 removed that lifetime send gate entirely.
12. v0.2.13 added approval-aware manual-confirmation resume so GitHub action approval waiting does not trigger duplicate Rerun retries.
13. The user then reported another freeze mode: a ChatGPT answer can error or hang mid-response and remain in a generating state, leaving Rerun unable to continue because `isChatIdle()` never becomes true.
14. v0.2.14 adds a 23-minute active-generation watchdog that force-clicks ChatGPT Stop for Rerun-owned generations only.

## v0.2.14 stuck-generation watchdog

- `content.js` defines `GENERATION_WATCHDOG_MS = 23 * 60 * 1000`.
- The watchdog is armed only after `sendPrompt()` has visible dispatch evidence for a Rerun-submitted prompt.
- The content script checks the tab runtime and disables/resets the watchdog when the Rerun watcher is not enabled, so unrelated manual ChatGPT generations are not targeted.
- It uses the same visible/actionable Stop-button detection as `isChatIdle()` and ignores disabled/hidden stop controls.
- GitHub action-confirmation waiting pauses the active-time clock; the wait is subtracted from the 23-minute budget.
- If active generation time reaches 23 minutes, the watchdog clicks the current Stop button once and returns from that tick.
- After ChatGPT becomes idle, watchdog state resets. Existing GitHub `continue` / same-sequence retry or fresh-authorization logic remains responsible for the next continuation.
- The existing assistant contract still requires an 18-minute checkpoint and response end before 20 minutes. The 23-minute browser watchdog is only a recovery grace period when that contract fails because the response hangs.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.12 lifetime-cap removal | COMMITTED / SOURCE-VERIFIED | Background dispatch/claim/handoff has no lifetime gate. |
| v0.2.13 approval-aware config/UI | COMMITTED / SOURCE-VERIFIED | Checkbox, saved boolean, runtime summary, checkbox CSS present. |
| v0.2.13 no auto-approval | COMMITTED / SOURCE-VERIFIED | Approval detector does not click confirmation UI. |
| v0.2.14 watchdog implementation | COMMITTED / SOURCE-VERIFIED | 23-minute constant, Rerun-only arm, watcher-enabled gate, Stop click and reset paths present. |
| v0.2.14 watchdog approval exclusion | COMMITTED / SOURCE-VERIFIED | approval waiting pauses and is subtracted from active-generation time. |
| v0.2.14 source regression assertions | COMMITTED | `tests/content-send.test.mjs` covers timing, ownership scope, approval pause and stop-button filtering. |
| v0.2.14 manifest/package | COMMITTED | version `0.2.14`. |
| v0.2.14 latest full npm suite | NOT_RUN | Exact branch checkout is not available in this runtime. |
| v0.2.14 live 23-minute forced-stop behavior | PENDING | Requires Reload and live browser observation or a controlled shortened-time browser probe. |
| v0.2.13 live GitHub approval-card behavior | PENDING | Requires actual action confirmation in ChatGPT. |
| SimpleVTT browser dispatch/recovery | PENDING | Requires live browser observation. |

## Next browser probe

1. Reload unpacked ChatGPT Rerun v0.2.14.
2. Keep the SimpleVTT watcher Watching.
3. Verify normal Rerun work still follows the 18-minute checkpoint / 20-minute end rule.
4. For watchdog verification, use a controlled stuck-generation case or a temporary shortened watchdog build if waiting 23 minutes is impractical.
5. Confirm the Rerun-owned generation receives one automatic Stop when the watchdog threshold is reached.
6. Confirm the watcher stays enabled and continuation can resume without another Start click.
7. Confirm a normal manual ChatGPT generation with watcher stopped is not force-stopped.
8. Confirm GitHub approval-card waiting is not counted toward the watchdog active time.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until live SimpleVTT dispatch/fresh-chat behavior, rate-limit behavior, approval-aware manual-confirmation resume, and the v0.2.14 stuck-generation recovery path are observed in the browser.
