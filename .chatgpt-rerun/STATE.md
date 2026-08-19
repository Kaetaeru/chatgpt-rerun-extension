# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.14 adds a 23-active-minute stuck-generation watchdog for Rerun-owned responses; reload and live-test forced Stop/recovery on SimpleVTT.`
- Phase: `awaiting_v0214_simplevtt_generation_watchdog_probe`
- Last checkpoint (UTC): `2026-08-19T17:55:00Z`

## Current Objective

Verify v0.2.14 on the live Rerun workflow after the user reported a distinct freeze mode: ChatGPT can error or stall mid-answer while still presenting a generating/Stop state. In that condition the existing content loop sees the chat as non-idle forever, so GitHub `continue` cannot dispatch another recovery turn.

The normal assistant contract remains unchanged: checkpoint around 18 minutes and end the response before the 20-minute hard stop. The new 23-minute browser watchdog is only a recovery grace period when that contract fails because the ChatGPT generation remains stuck.

## v0.2.14 implementation

- `content.js`: adds `GENERATION_WATCHDOG_MS = 23 * 60 * 1000`.
- The watchdog is armed by `sendPrompt()` only after a Rerun prompt has actual dispatch evidence; merely observing an arbitrary ChatGPT generation does not arm it.
- `isRerunWatcherEnabled()` reads the current tab runtime. If the watcher is not enabled, watchdog state resets.
- A 15-second dispatch-start grace prevents the timer from being discarded during the short period before ChatGPT's Stop control appears.
- `findStopButton()` now centralizes visible/actionable Stop detection and is also used by `isChatIdle()`.
- Disabled, aria-disabled, and layout-hidden Stop controls are ignored.
- GitHub action-confirmation waiting pauses the watchdog clock. That user-decision time is subtracted from active-generation duration even when the approval-aware retry option is being used.
- At 23 active minutes, the watchdog clicks the current Stop button once and returns from the tick.
- After ChatGPT becomes idle, watchdog state resets. Existing same-sequence retry/fresh-control-generation logic remains responsible for the next continuation.
- The forced Stop does not disable the tab watcher and does not alter GitHub control/sequence.
- Manual/non-Rerun ChatGPT generations are not armed and must not be force-stopped merely because a content script is present.

## Safety / protocol boundary

- 20 minutes remains the assistant execution hard stop; 23 minutes is a browser fail-safe, not a larger normal work budget.
- The watchdog controls only the ordinary ChatGPT Stop-generation UI for a Rerun-owned response.
- It does not click GitHub approval, OAuth, repository-access, or administrator confirmation UI.
- It does not parse assistant response text or error copy to decide whether a generation is stuck.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| v0.2.12 lifetime send-cap removal | COMMITTED / SOURCE-VERIFIED | Historical `Sent` count no longer blocks dispatch/claim/handoff. |
| v0.2.13 approval-aware config/UI | COMMITTED / SOURCE-VERIFIED | Approval wait behavior retained. |
| v0.2.14 watchdog code | COMMITTED / SOURCE-VERIFIED | 23-minute threshold, Rerun-only arm, watcher-enabled scope, Stop click and reset present. |
| v0.2.14 approval-time exclusion | COMMITTED / SOURCE-VERIFIED | approval wait pauses and is subtracted from active time. |
| v0.2.14 manual-chat protection | COMMITTED / SOURCE-VERIFIED | watchdog is not armed by merely observing a manual generation. |
| v0.2.14 regression assertions | COMMITTED | `tests/content-send.test.mjs` covers scope/timing/approval/Stop filtering. |
| v0.2.14 manifest/package | COMMITTED | version bumped to `0.2.14`. |
| v0.2.14 exact latest full npm suite | NOT_RUN | Exact branch checkout is not available in this runtime. |
| v0.2.14 live forced Stop | NOT_RUN | Requires Reload and live/controlled browser probe. |

## Next Exact Action

1. Reload unpacked extension v0.2.14.
2. Return to the existing ChatGPT tab connected to `Kaetaeru/SimpleVTT @ main` and keep/turn watcher Watching.
3. Confirm ordinary runs still checkpoint around 18 minutes and finish before 20 minutes.
4. For practical watchdog testing, use a controlled stuck-generation case or temporarily shorten the watchdog threshold in a local-only test build while keeping the production constant 23 minutes.
5. Verify the Rerun-owned response gets one automatic Stop at the threshold equivalent.
6. Verify the tab watcher remains Watching and the existing continuation/retry path can resume without another Start click.
7. Verify GitHub approval waiting is excluded from watchdog time.
8. Verify watcher-stopped/manual ChatGPT generations are not force-stopped.

Do not change SimpleVTT's run_id or sequence merely to wake the watcher.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not change SimpleVTT sequence merely to bypass local extension counters.
- Do not reintroduce a lifetime Max sends cap.
- Do not remove per-generation retry protection for unchanged/stuck control.
- Do not auto-click app approval, OAuth, repository-access, or administrator-approval UI.
- Do not parse assistant limit/error text to trigger the watchdog.
- Do not apply the 23-minute watchdog to ordinary manual ChatGPT generations.
- Do not reinterpret 23 minutes as the normal assistant execution budget; normal hard stop remains 20 minutes.
- Do not overwrite non-Rerun user drafts.
- Do not recursively open fresh chats after direct handoff failure.
- Do not merge PR #1 unless explicitly requested.
- Do not use STATUS for reconciliation.
