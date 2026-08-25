# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: **0.2.16**
- Status: `V02_009_LIVE_VERIFY`
- Current task: `V02-009`

## Stable verified baseline

V02-001 through V02-008 remain verified from earlier browser evidence: tab isolation, stream collision guard, dispatch/retry baseline, fresh-chat ownership transfer, handoff safeguards, persistent watcher across terminal work state, Start/Stop toggle, and unconnected-first onboarding.

## Regression chain

1. v0.2.6 fixed prompt paste-without-submit.
2. v0.2.7~0.2.9 hardened fresh-chat/exhausted-chat handoff.
3. v0.2.10 added rate-limit-safe GitHub polling and raised unauthenticated regular polling conservatively.
4. v0.2.11 fixed fresh same-sequence authorization.
5. v0.2.12 removed the lifetime send cap.
6. v0.2.13 added approval-aware waiting with manual confirmation.
7. v0.2.14 added the 23-minute stuck-generation Stop watchdog.
8. v0.2.15 fixed watchdog Stop leaving the watcher permanently trapped at same-sequence `retry_limit` by re-arming retry/pending state before Stop.
9. The user then identified a separate UX regression: **normal responses no longer chained immediately**. Unchanged same-sequence `continue` was being treated as retry, so normal work could wait for `retryDelaySeconds=120` and regular public polling.
10. v0.2.16 restores normal chaining as a distinct lifecycle path.

## v0.2.16 implementation

### Content lifecycle

- A Rerun prompt still arms generation tracking only after visible dispatch evidence.
- Once an active Stop control has been observed, its disappearance is treated as generation completion on the next base content tick.
- A trusted user click on the ChatGPT Stop control marks the generation as manually interrupted and excludes it from normal chaining.
- A watchdog-forced Stop is also excluded because `generationWatchdogFired` is set before the programmatic click.
- Normal completion sets one `normalContinuationPending` marker.
- The next `POLL` carries `afterGenerationComplete=true`; the marker is consumed after one background response so a persistent API error cannot cause 2-second request hammering.

### Background refresh and dispatch

- `POLL` now receives the completion flag.
- A completion poll bypasses the normal local GitHub poll-cache interval once and performs an authoritative control fetch.
- Active GitHub server-side rate-limit pause is still respected.
- Terminal `complete` / `needs_user` / `blocked`, pending-claim, and sequence-regression guards remain ahead of the fast path.
- If refreshed control is valid `continue`, background returns `normalContinuation=true` even when ordinary unchanged-generation retry delay/count would otherwise wait or be exhausted.
- Normal-continuation claim sets `pendingIsRetry=false`, so ACK does not consume retry budget.
- Existing retry delay/count remains for abnormal recovery only.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.15 watchdog re-arm | COMMITTED / SOURCE-VERIFIED | Forced Stop clears same-sequence retry count and stale pending claim before click. |
| v0.2.16 normal completion detection | COMMITTED / SOURCE-VERIFIED | `generationObservedActive`, trusted manual-Stop exclusion, one completion marker. |
| v0.2.16 immediate control refresh | COMMITTED / SOURCE-VERIFIED | completion flag bypasses local poll cache once. |
| v0.2.16 normal continuation claim | COMMITTED / SOURCE-VERIFIED | terminal/regression guards preserved; `pendingIsRetry=false`. |
| v0.2.16 source regression assertions | COMMITTED | content-send and watcher-flow source tests updated. |
| manifest/package | COMMITTED | version `0.2.16`. |
| exact latest `npm run check` / `npm test` | NOT_RUN | Current execution environment cannot resolve `github.com` to materialize exact checkout. |
| live normal-completion immediate chain | PENDING | Requires extension Reload and browser observation. |
| live watchdog/approval paths | PENDING | Retained browser gates. |

## Current browser probe

1. Reload unpacked ChatGPT Rerun v0.2.16.
2. Keep a valid watcher Watching, preferably `Kaetaeru/SimpleVTT @ work/v1-composite` when its control is intentionally `continue`.
3. Let one Rerun response finish normally.
4. Confirm the next Rerun prompt begins on the next completion cycle, approximately the next 2-second content tick plus GitHub request latency, rather than waiting 90/120 seconds.
5. Confirm terminal GitHub state stops the chain while watcher remains Watching.
6. Confirm manually clicking ChatGPT Stop does not immediately auto-chain.
7. Confirm watchdog Stop follows recovery instead of normal chaining.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until v0.2.16 immediate normal chaining and the remaining browser recovery paths have live evidence.
