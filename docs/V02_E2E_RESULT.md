# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.10`
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
6. A later browser probe hit the GitHub public REST rate limit, blocking the intended handoff probe.
7. v0.2.10 added rate-limit-safe polling and pause/resume behavior.

## v0.2.10 rate-limit resilience

- Unauthenticated polling reserves headroom: minimum effective interval is 90 seconds for one unauthenticated watcher and scales by enabled unauthenticated watcher count.
- Authenticated polling retains the 5-second minimum.
- GitHub `403/429` rate-limit responses derive a pause deadline from `Retry-After`, `X-RateLimit-Reset`, or a secondary-limit fallback.
- Rate limiting is represented as runtime wait state, not watcher Stop.
- Polling resumes automatically after the pause deadline.
- Side Panel shows `API polling`: `Public · rate-safe`, `Authenticated · conditional`, or `Paused until ...`.

## Latest browser evidence

At approximately 2026-08-17 04:01 KST, the user reported that the Side Panel shows `Public · rate-safe`, but no automatic work started.

Inspection of the authoritative GitHub control showed this was not a polling failure: `.chatgpt-rerun/control.json` was intentionally still `status=needs_user`, sequence 9, task V02-009. Under the watcher/work-state contract, `needs_user` keeps the watcher polling but suppresses resume dispatch. Therefore the observed lack of execution is expected while that gate remains terminal.

This observation confirms the v0.2.10 UI/build is loaded far enough to expose the new public rate-safe mode. It does not yet prove the explicit `Paused until ...` rate-limit path because the quota is currently not reported as paused.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.10 source changes | COMMITTED | control/background/popup/manifest/package and regression tests updated. |
| v0.2.10 UI loaded | PASS | User observed `Public · rate-safe`. |
| Current no-dispatch root cause | PASS | Authoritative control was `needs_user`; watcher correctly did not dispatch. |
| v0.2.10 explicit rate-limit pause/resume | PENDING | Requires live `Paused until ...` observation or equivalent browser evidence. |
| v0.2.10 exhausted-chat fresh handoff | PENDING | Re-arm same sequence to `continue` and observe automatic dispatch/handoff. |
| v0.2.10 latest full npm suite | NOT_RUN | No GitHub Actions workflow exists and this runtime still cannot materialize the latest GitHub checkout for execution. |

## Next browser probe

Re-arm sequence 9 from `needs_user` to `continue` without restarting the watcher. Expected: the already-enabled watcher notices the terminal-to-continue authorization and automatically submits the resume prompt. On the exhausted/stale-prompt chat, that path should transfer watcher ownership to one fresh ChatGPT tab rather than requiring another Start click.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until the live `continue` dispatch/fresh-chat handoff path succeeds and the remaining rate-limit behavior is accepted or directly observed.
