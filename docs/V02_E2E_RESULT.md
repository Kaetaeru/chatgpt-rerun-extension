# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.12`
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
8. SimpleVTT then exposed that same-sequence long tasks could hit `retry_limit` even after a fresh control rewrite.
9. v0.2.11 made newer same-sequence `updated_at` a fresh authorization rather than an unchanged-control retry.
10. SimpleVTT still stopped after many successful continuations because the independent lifetime `Max sends=20` gate ran before/around normal dispatch, claim, and handoff.
11. v0.2.12 removes that lifetime send gate entirely.

## SimpleVTT evidence

The actual live failing project is `Kaetaeru/SimpleVTT @ main`, not the Rerun extension dogfood stream.

Direct inspection showed:

- run_id `b7f27a61-29d8-4ba2-9f93-8e66722d5f41`
- sequence `1`
- status `continue`
- task `phase14-production-play-session-ux`
- STATE/PLAN explicitly require continuation on the same sequence
- Phase 14 history contains at least twenty deliberate continuation authorizations in the same run

The observed UI (`Watching`, `Public · rate-safe`, no dispatch) is consistent with the old lifetime `max_runs` wait path: API polling can remain healthy while dispatch is suppressed by a local counter.

## v0.2.12 lifetime-send fix

- Normal `actionForControl()` no longer checks `runCount >= maxRuns`.
- `CLAIM_SEQUENCE` no longer rejects `max_runs`.
- `handoffToNewChat()` no longer rejects historical `Sent` count.
- `runCount` remains a diagnostic counter only.
- Side Panel no longer exposes a visible `Max sends` setting and explains that total deliberate sends are unlimited.
- Existing stored `maxRuns` values remain compatibility-only and cannot stop the background worker.
- The unchanged-control `Retries / sequence` guard remains intact, so removing the lifetime cap does not create an infinite duplicate-send loop for a stuck control generation.

## Rate-limit resilience retained

- Unauthenticated polling reserves headroom: minimum effective interval is 90 seconds for one unauthenticated watcher and scales by enabled unauthenticated watcher count.
- Authenticated polling retains the 5-second minimum.
- GitHub `403/429` rate-limit responses become a pause deadline rather than watcher Stop.
- Side Panel shows `API polling`: `Public · rate-safe`, `Authenticated · conditional`, or `Paused until ...`.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.12 background lifetime-cap removal | COMMITTED / SOURCE-VERIFIED | Remote background source has no `max_runs` dispatch/claim/handoff gate. |
| v0.2.12 UI Max sends removal | COMMITTED / SOURCE-VERIFIED | Visible field removed; unlimited-send hint present. |
| v0.2.12 regression assertions | COMMITTED | control/watcher/popup tests updated. |
| v0.2.12 manifest | PASS SOURCE | version `0.2.12`. |
| v0.2.12 latest full npm suite | NOT_RUN | Container cannot resolve github.com and no exact mounted checkout is available. |
| v0.2.12 SimpleVTT browser dispatch | PENDING | Requires extension Reload on the user's live SimpleVTT tab. |
| v0.2.12 exhausted-chat fresh handoff | PENDING | Must be observed after live dispatch reaches exhausted chat path. |
| explicit rate-limit pause/resume | PENDING | Requires live `Paused until ...` observation or equivalent browser evidence. |

## Next browser probe

Reload unpacked extension v0.2.12. On the existing SimpleVTT ChatGPT tab, keep the connection on `Kaetaeru/SimpleVTT @ main` and watcher enabled. Do not change SimpleVTT's run/sequence merely to wake it. The next successful control poll must be able to dispatch current sequence 1 / `continue` regardless of historical `Sent` count. If the chat is exhausted, fresh-chat handoff must also ignore historical `Sent` count.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until the live SimpleVTT dispatch/fresh-chat handoff path succeeds and remaining rate-limit behavior is accepted or directly observed.
