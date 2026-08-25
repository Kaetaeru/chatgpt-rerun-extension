# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Phase: `awaiting_v0216_immediate_completion_probe`
- Extension version: `0.2.16`
- Checkpointed at: `2026-08-25T19:54:23Z` (`2026-08-26 04:54:23 +09:00`)

## Current objective

Restore the original continuous Rerun behavior without weakening failure safeguards: a **normally completed** Rerun response should cause one immediate authoritative GitHub control refresh and, when latest control remains `continue`, the next Rerun prompt should be submitted immediately rather than being delayed by regular polling or same-sequence retry timing.

## Root cause confirmed

The workflow had conflated successful normal execution completion with abnormal unchanged-generation retry/recovery. `retryDelaySeconds=120` and conservative unauthenticated GitHub polling were therefore pacing normal work, even though those controls were introduced only as safety/recovery mechanisms.

Normal workflow cadence must instead be completion-driven.

## Work completed

### v0.2.15 watchdog recovery re-arm

Before the 23-minute watchdog clicks ChatGPT Stop, content runtime clears `sameSequenceRetryCount` and stale pending claim fields. A watchdog Stop can therefore recover instead of remaining permanently at `retry_limit`.

### v0.2.16 normal completion lifecycle

`content.js` now distinguishes normal completion from interruption:

- generation tracking is armed only after actual Rerun prompt dispatch evidence;
- `generationObservedActive` records that the ChatGPT Stop control was actually visible;
- once active generation was observed, Stop disappearance is processed on the next 2-second content tick instead of waiting the 15-second startup grace;
- trusted user Stop clicks set `generationInterruptedByUser=true`;
- watchdog Stop has `generationWatchdogFired=true` before the programmatic click;
- only a non-manual, non-watchdog completion sets `normalContinuationPending=true`;
- the next `POLL` carries `afterGenerationComplete=true`;
- the completion marker is consumed after one background response so persistent API errors cannot create a 2-second request hammer loop.

`background.js` now treats that completion as a distinct one-shot path:

- `POLL` receives the completion flag;
- completion polling bypasses the normal **local** GitHub poll-cache interval once and fetches authoritative control;
- active GitHub server-side rate-limit pause remains respected;
- terminal `complete` / `needs_user` / `blocked`, pending claim, and sequence regression remain ahead of the fast continuation path;
- valid refreshed `continue` returns `normalContinuation=true` even when ordinary unchanged-generation retry timing/count would otherwise wait or be exhausted;
- `CLAIM_SEQUENCE` for normal continuation records `pendingIsRetry=false`, so ACK does not consume abnormal retry budget.

The ordinary retry delay/count path remains unchanged for abnormal recovery.

## Regression assertions

Source assertions now pin:

- completion `POLL { afterGenerationComplete: true }`;
- one-shot local cache bypass;
- normal continuation claim with `pendingIsRetry=false`;
- terminal and sequence-regression ordering before fast continuation;
- trusted manual Stop exclusion;
- watchdog Stop exclusion and re-arm;
- observed-active completion bypassing startup grace;
- completion marker consumption after one response;
- no lifetime max-runs gate.

A test-only escaping error in the approval-detector source assertion was discovered during final review. A standalone Node probe reproduced the mismatch (`false`); the assertion was corrected and the equivalent probe now returns **`true`**. This was a test regex correction, not a product-code behavior change.

## Validation status

| Check | Result | Note |
|---|---|---|
| v0.2.15 watchdog re-arm source | COMMITTED / SOURCE-VERIFIED | Forced Stop recovery state reset present. |
| v0.2.16 content completion path | COMMITTED / SOURCE-VERIFIED | Normal/manual/watchdog distinction present. |
| v0.2.16 background immediate refresh | COMMITTED / SOURCE-VERIFIED | Completion bypasses local poll cache once. |
| v0.2.16 normal claim | COMMITTED / SOURCE-VERIFIED | `pendingIsRetry=false`; terminal/regression guards preserved. |
| v0.2.16 source regression assertions | COMMITTED | content-send and watcher-flow updated. |
| approval assertion targeted regex probe | PASS TARGETED | Corrected source-regex matcher returns `true`. |
| manifest/package version | COMMITTED | `0.2.16`. |
| exact latest `npm run check` / `npm test` | NOT_RUN | Exact checkout could not be materialized because this runtime failed DNS resolution for `github.com`: `Could not resolve host: github.com`. |
| live immediate chaining | NOT_RUN | Requires Reload and actual browser observation. |
| live manual/watchdog Stop boundaries | NOT_RUN | Requires browser observation. |

No full-suite or browser PASS is claimed.

## Next Exact Action

1. Reload unpacked ChatGPT Rerun **v0.2.16** from `chrome://extensions`.
2. Return to a connected ChatGPT tab with watcher `Watching`; `Kaetaeru/SimpleVTT @ work/v1-composite` is the current dogfood target when its GitHub control is intentionally `continue`.
3. Let a Rerun-owned response finish normally without clicking Stop.
4. Verify that after the active Stop control disappears, the next content cycle performs the immediate GitHub refresh and the next prompt is automatically submitted without waiting 90/120 seconds when refreshed control remains `continue`.
5. Verify terminal GitHub status prevents chaining while watcher remains enabled.
6. Verify manually clicking ChatGPT Stop does not immediately auto-chain.
7. Verify a controlled 23-minute watchdog Stop recovers through its re-armed abnormal path and does not freeze at `retry_limit`.
8. Record live evidence in `docs/V02_E2E_RESULT.md`; only then advance V02-009 completion status.

## Do not repeat / regress

- Do not repeat V02-001 through V02-008 without new evidence of regression.
- Do not use normal retry delay as the cadence between successful executions.
- Do not remove abnormal retry protection.
- Do not reintroduce lifetime `Max sends`.
- Do not auto-click GitHub/ChatGPT approval controls.
- Do not treat user manual Stop as normal completion.
- Do not treat watchdog Stop as normal completion.
- Do not bypass an active GitHub server-side rate-limit pause.
- Do not merge PR #1 unless explicitly requested.
