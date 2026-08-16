# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.10`
- Status: `WAITING_FOR_V02_009_BROWSER_VERIFY`
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
6. Latest browser probe: Start surfaced `GitHub API rate limit reached; wait for reset or use a token`, preventing the intended exhausted-chat probe from progressing.

## Rate-limit root cause

The extension previously clamped unauthenticated polling to exactly 60 seconds. GitHub's unauthenticated primary REST limit is 60 requests per hour, so one continuously polling watcher could consume the entire nominal budget before accounting for Start-time fetches, repository probes, additional watcher streams, or other traffic from the same public IP. Rate-limit responses were thrown as ordinary errors, so Start could fail instead of leaving the watcher alive.

## v0.2.10 rate-limit resilience

- Unauthenticated polling now reserves headroom: minimum effective interval is 90 seconds for one unauthenticated watcher and scales by the number of enabled unauthenticated watchers (`90 * watcherCount`).
- Authenticated polling retains the 5-second minimum.
- GitHub `403/429` rate-limit responses derive a pause deadline from `Retry-After`, `X-RateLimit-Reset`, or the documented secondary-limit fallback.
- Rate limiting is represented as `rateLimitPausedUntil` runtime state, not as a watcher Stop.
- A watcher already being started when the API is rate-limited remains enabled and returns `rate_limited_wait`.
- Polling automatically resumes after the pause deadline.
- `Rate remaining` was removed from the user-facing panel and replaced by `API polling`: `Public · rate-safe`, `Authenticated · conditional`, or `Paused until ...`.
- Fresh-chat handoff can use cached control/runtime identity while extension REST polling is paused, so GitHub API quota should not block context transfer when sufficient local state exists.
- New `tests/rate-limit-flow.test.mjs` and updated control/popup tests lock these behaviors.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.10 source changes | COMMITTED | control/background/popup/manifest/package and regression tests updated. |
| GitHub official behavior | VERIFIED | Unauthenticated primary REST limit is 60/hour; authenticated user limit is generally 5,000/hour; correctly authenticated conditional 304 responses do not consume primary quota. |
| v0.2.10 latest full npm suite | NOT_RUN | No GitHub Actions workflow exists and this runtime still cannot materialize the latest GitHub checkout for execution. |
| v0.2.10 browser rate-limit behavior | NOT_RUN | Requires unpacked extension Reload. |
| v0.2.10 exhausted-chat fresh handoff | NOT_RUN | Requires Reload and live ChatGPT UI. |

## Next browser probe

1. Reload unpacked ChatGPT Rerun v0.2.10.
2. On the same connected test tab, press Start.
3. If the GitHub quota is still exhausted, expected: `Tab watcher = Watching`, button = `Stop`, `API polling = Paused until ...`, and no red `GitHub API rate limit reached` failure.
4. If the quota has already reset, expected: `API polling = Public · rate-safe` without a token, or `Authenticated · conditional` with a token.
5. Continue the exhausted-chat handoff probe. A stale Rerun-owned prompt or a confirmed failed dispatch should open one fresh ChatGPT tab and transfer watcher ownership.
6. If uninterrupted fast polling is desired, provide a GitHub token and set Poll seconds to 5–10; the extension then uses authenticated conditional requests.

## Completion assessment

V02-001~008 remain verified. V02-009 is **not yet PASS** until v0.2.10 live browser evidence confirms rate-limit pause behavior and the fresh-chat automatic resume path.
