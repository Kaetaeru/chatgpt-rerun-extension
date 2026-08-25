# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: **0.2.18**
- Status: `V02_009_LIVE_VERIFY`
- Current task: `V02-009`

## Stable verified baseline

V02-001 through V02-008 remain verified from earlier browser evidence: tab isolation, stream collision guard, dispatch/retry baseline, fresh-chat ownership transfer, handoff safeguards, persistent watcher across terminal work state, Start/Stop toggle, and unconnected-first onboarding.

## Regression chain

1. v0.2.6 fixed prompt paste-without-submit.
2. v0.2.7~0.2.9 hardened fresh-chat/exhausted-chat handoff.
3. v0.2.10 added rate-limit-safe GitHub polling.
4. v0.2.11 fixed fresh same-sequence authorization.
5. v0.2.12 removed the lifetime send cap.
6. v0.2.13 added approval-aware waiting with manual confirmation.
7. v0.2.14 added the 23-minute stuck-generation Stop watchdog.
8. v0.2.15 re-armed pending/retry state before watchdog Stop.
9. v0.2.16 restored immediate normal completion chaining.
10. v0.2.17 reset same-sequence retry history immediately when a normal response succeeds.
11. The user then reported that fresh conversations were no longer being recognized/reached. Source inspection found a distinct gap: after `POLL -> continue`, if the current chat was idle but `findComposer()` returned null, `content.js` simply returned. An exhausted/non-dispatchable chat could therefore remain Watching forever without invoking the existing new-chat handoff.
12. v0.2.18 closes that missing-composer gap.

## v0.2.18 implementation

- `content.js` first uses the current composer when present.
- If absent, it reuses `waitForComposer(5_000)` to allow transient ChatGPT SPA rendering to settle.
- If a composer appears during the wait, normal current-chat dispatch continues.
- If no composer appears, it calls the already-existing `handoffAfterDispatchFailure()` / `HANDOFF_NEW_CHAT` path.
- Existing background handoff logic remains the single ownership-transfer implementation.
- Successful handoff opens one new ChatGPT tab, copies config/runtime ownership, disables the old watcher, and sends the GitHub-backed handoff prompt.
- Failed direct handoff submission safe-stops instead of recursively opening new tabs.
- Existing user-draft, collision, terminal, rate-limit, approval, normal-completion, retry-reset, and watchdog protections remain unchanged.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.17 normal success retry reset | COMMITTED / SOURCE-VERIFIED | Successful completion clears same-sequence retry history before continuation. |
| v0.2.18 missing-composer recovery | COMMITTED / SOURCE-VERIFIED | `findComposer() || waitForComposer(5_000)` followed by existing fresh-chat handoff. |
| v0.2.18 regression assertion | COMMITTED / SOURCE-VERIFIED | `tests/content-send.test.mjs` pins missing-composer handoff behavior. |
| manifest/package | COMMITTED | version `0.2.18`. |
| exact latest `npm run check` / `npm test` | NOT_RUN | Container failed DNS resolution for `raw.githubusercontent.com` before remote files could be materialized. |
| live missing-composer handoff | PENDING | Requires extension Reload and browser observation. |
| live new-tab ownership/prompt submission | PENDING | Requires browser observation. |

No full-suite or browser PASS is claimed.

## Current browser probe

1. Pull and reload unpacked ChatGPT Rerun v0.2.18.
2. Refresh the existing connected ChatGPT tab.
3. Keep the SimpleVTT `work/v1-composite` watcher Watching when its GitHub control is intentionally `continue`.
4. Confirm normal responses still clear Same-sequence retries and chain immediately.
5. Exercise an idle current-chat state with no usable composer.
6. Confirm Rerun waits no more than the 5-second render grace, then opens one fresh ChatGPT tab and transfers watcher ownership.
7. Confirm the fresh tab auto-submits the GitHub-backed handoff prompt and the old tab becomes handed off/stopped.
8. Confirm direct handoff failure does not recursively open further tabs.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until v0.2.18 fresh-chat recovery and the remaining live browser paths have direct evidence.
