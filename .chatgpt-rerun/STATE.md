# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.10 keeps the watcher alive across GitHub REST rate limits with rate-safe polling and automatic reset/resume; reload before browser verification.`
- Phase: `awaiting_v0210_reload_and_rate_limit_probe`
- Last checkpoint (UTC): `2026-08-16T18:40:00Z`
- Current execution started (UTC): `2026-08-16T18:40:00Z`
- Current execution hard stop (UTC): `2026-08-16T19:00:00Z`

## Current Objective

Verify V02-009 on v0.2.10. GitHub REST rate limiting must no longer make Start fail or turn the watcher back off. The watcher must remain enabled, expose a temporary API polling pause, and resume automatically after the server-provided reset/retry deadline. After that gate, continue the exhausted-chat fresh-handoff probe from v0.2.9.

## Latest browser evidence

The user reported the exact Side Panel error: `GitHub API rate limit reached; wait for reset or use a token` and asked for Rerun to keep running without manual intervention.

GitHub's unauthenticated REST budget is only 60 requests/hour. The previous unauthenticated minimum interval was exactly 60 seconds, so a single long-running watcher could consume the entire nominal budget before Start-time fetches, repository probes, multiple control streams, or any other traffic from the same public IP were counted.

## v0.2.10 fix completed

- `control.js` changes the unauthenticated effective polling minimum to 90 seconds for one watcher and scales it by enabled unauthenticated watcher count (`90 * count`).
- Authenticated polling retains a 5-second minimum.
- `background.js` converts GitHub `403/429` rate-limit responses into a stored `rateLimitPausedUntil` deadline based on `Retry-After`, `X-RateLimit-Reset`, or the secondary-rate-limit fallback.
- `poll()` returns `wait / rate_limit` while that deadline is active instead of throwing an ordinary watcher failure.
- `startTabSession()` catches the rate-limit pause, leaves `runtime.enabled=true`, wakes the content script, and returns `rate_limited_wait`.
- Once the deadline expires, the next normal poll clears the pause and retries automatically; the user does not need to press Start again.
- Multiple unauthenticated watchers share a conservative aggregate request budget through dynamic interval scaling.
- Fresh-chat handoff can fall back to cached control or runtime run/sequence/status while extension REST polling is paused, so API quota does not unnecessarily block context transfer.
- Side Panel removes raw `Rate remaining` and shows `API polling`: `Public · rate-safe`, `Authenticated · conditional`, or `Paused until ...`.
- New `tests/rate-limit-flow.test.mjs` plus control/popup regression updates are committed.
- Manifest/package bumped to `0.2.10`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| v0.2.8 exhausted-chat browser probe | FAIL | Start returned to Start; no fresh tab opened. |
| v0.2.9 stale-prompt source/regression fix | COMMITTED | Browser probe was blocked by GitHub API rate limit. |
| GitHub official rate-limit behavior | VERIFIED | Public REST 60/hour; authenticated user 5,000/hour; authorized conditional 304 does not consume primary quota. |
| v0.2.10 remote source inspection | PASS | Rate-limit pause state, rate-safe interval scaling, and Start-wait path are committed. |
| v0.2.10 regression tests | COMMITTED | control polling + popup UI + new rate-limit-flow assertions. |
| v0.2.10 exact latest full npm suite | NOT_RUN | No GitHub Actions workflow; this runtime could not materialize the latest checkout for execution. |
| v0.2.10 live browser rate-limit behavior | NOT_RUN | Requires extension Reload. |
| v0.2.10 exhausted-chat fresh handoff | NOT_RUN | Continue after rate-limit gate. |

## Next Exact Action

Reload unpacked ChatGPT Rerun v0.2.10. On the same connected test tab press Start. If GitHub quota is still exhausted, expected: `Tab watcher = Watching`, button = `Stop`, and `API polling = Paused until ...` with no red rate-limit error. If the quota has already reset, expected: `API polling = Public · rate-safe` without a token or `Authenticated · conditional` with a token. Then continue the exhausted-chat Start/handoff test; a stale Rerun-owned prompt should route to one fresh ChatGPT tab.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not claim the GitHub server API is literally unlimited; respect its reset/retry contract.
- Do not turn GitHub rate limiting into watcher Stop or require repeated Start clicks.
- Do not parse assistant output or limit-warning text.
- Do not overwrite a non-empty composer unless its normalized text exactly equals the configured Rerun resume prompt.
- Do not recursively open fresh chats if the direct handoff prompt fails in the fresh tab.
- Do not merge PR #1 unless the user explicitly requests it.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.10 and repeat Start on the connected test tab.
- Optional for uninterrupted fast polling: enter a GitHub token and use Poll seconds 5–10.
