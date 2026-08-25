# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Phase: `awaiting_v0217_retry_reset_probe`
- Extension version: `0.2.17`
- Checkpointed at: `2026-08-25T20:11:45Z` (`2026-08-26 05:11:45 +09:00`)

## Current objective

Preserve immediate normal chaining while fixing the retry telemetry/state semantics: a **normally completed** Rerun response must clear `sameSequenceRetryCount` immediately, before the next prompt is dispatched or ACKed. Successful executions must not accumulate in `Same-sequence retries`.

## Root cause confirmed

v0.2.16 correctly separated normal completion from abnormal retry for the next dispatch, but the runtime retry counter itself was only guaranteed to become zero when the **next normal-continuation prompt ACKed**.

That was too late. If normal execution completed successfully and refreshed control became terminal (`complete`, `needs_user`, `blocked`), or the next dispatch had not happened yet, the Side Panel could still display retry history from an earlier abnormal retry. The visible counter therefore did not represent unresolved retry state.

## Work completed

### v0.2.15 watchdog recovery re-arm

Before the 23-minute watchdog clicks ChatGPT Stop, content runtime clears `sameSequenceRetryCount` and stale pending claim fields. A watchdog Stop can therefore recover instead of remaining permanently at `retry_limit`.

### v0.2.16 normal completion lifecycle

Normal Rerun generation completion is distinguished from trusted user Stop and watchdog Stop. Successful completion triggers one immediate authoritative GitHub control refresh and refreshed `continue` bypasses regular poll/retry delay as a normal continuation.

### v0.2.17 successful-completion retry reset

`content.js` now resets retry history at the actual success boundary:

- when the active Rerun generation ends normally, `completedNormally` becomes true;
- before `normalContinuationPending=true`, content calls `resetSameSequenceRetryCount()`;
- that helper updates the current tab runtime and sets only `sameSequenceRetryCount: 0`;
- it does not reset `runCount` / `Sent`;
- it does not classify trusted manual Stop as success;
- watchdog Stop still uses its separate `rearmContinuationAfterWatchdogStop()` recovery path;
- the subsequent normal-continuation claim still sets `pendingIsRetry=false`, so ACK keeps the counter at zero.

Therefore successful completion clears the visible `Same-sequence retries` counter even when refreshed GitHub state is terminal and there is no next prompt ACK.

## Regression assertions

`tests/content-send.test.mjs` now requires:

- normal completion block calls `await resetSameSequenceRetryCount()` before setting `normalContinuationPending=true`;
- `resetSameSequenceRetryCount()` writes `sameSequenceRetryCount: 0`;
- normal completion still performs the immediate control refresh path;
- manual Stop remains excluded from normal success;
- watchdog recovery behavior remains present.

## Validation status

| Check | Result | Note |
|---|---|---|
| v0.2.15 watchdog re-arm source | COMMITTED / SOURCE-VERIFIED | Forced Stop recovery state reset present. |
| v0.2.16 immediate completion path | COMMITTED / SOURCE-VERIFIED | Normal/manual/watchdog distinction and immediate refresh present. |
| v0.2.17 success retry reset | COMMITTED / SOURCE-VERIFIED | Normal success invokes `resetSameSequenceRetryCount()` before continuation. |
| v0.2.17 regression assertion | COMMITTED | `tests/content-send.test.mjs` pins reset ordering and zero value. |
| manifest/package version | COMMITTED | `0.2.17`. |
| exact latest `npm run check` / `npm test` | NOT_RUN | Exact checkout still cannot be materialized in this runtime because DNS resolution for GitHub fails (`Could not resolve host: raw.githubusercontent.com`). |
| live retry reset | NOT_RUN | Requires extension Reload and actual browser observation. |
| live immediate chaining | NOT_RUN | Requires browser observation. |

No full-suite or browser PASS is claimed.

## Next Exact Action

1. Pull/reload unpacked ChatGPT Rerun **v0.2.17** from `chrome://extensions`.
2. Return to a connected ChatGPT tab with watcher `Watching`; `Kaetaeru/SimpleVTT @ work/v1-composite` remains the primary dogfood target when its control is intentionally `continue`.
3. Allow a Rerun-owned response to complete normally without pressing Stop.
4. Verify `Same-sequence retries` becomes `0/N` immediately after generation completion, before/independent of the next prompt ACK.
5. Verify latest `continue` still chains immediately without the normal 90/120-second delays.
6. Verify terminal GitHub state leaves retries at zero and simply pauses dispatch while watcher stays enabled.
7. Verify trusted manual Stop does not get recorded as successful completion.
8. Verify watchdog Stop still uses abnormal recovery re-arm and remains recoverable.
9. Record actual live evidence before advancing V02-009.

## Do not repeat / regress

- Do not repeat V02-001 through V02-008 without new evidence of regression.
- Do not use successful normal executions to increment or retain `sameSequenceRetryCount`.
- Do not reset lifetime `Sent` / `runCount` on normal completion; it remains telemetry.
- Do not remove abnormal retry protection.
- Do not reintroduce lifetime `Max sends`.
- Do not auto-click GitHub/ChatGPT approval controls.
- Do not treat user manual Stop as normal completion.
- Do not treat watchdog Stop as normal completion.
- Do not bypass an active GitHub server-side rate-limit pause.
- Do not merge PR #1 unless explicitly requested.
