# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Phase: `awaiting_v0218_missing_composer_handoff_probe`
- Extension version: `0.2.18`
- Checkpointed at: `2026-08-25T21:17:00Z` (`2026-08-26 06:17:00 +09:00`)

## Current objective

Restore fresh-chat recovery without disturbing the v0.2.16/v0.2.17 completion fixes. When a valid `continue` is ready but the current ChatGPT conversation no longer exposes a composer, Rerun must recognize that the current chat is not dispatchable and use the existing one-shot new-chat ownership handoff instead of silently returning forever.

## Root cause confirmed

Current `content.js` had this path:

```text
POLL -> continue -> ChatGPT idle -> findComposer() == null -> return
```

Because that branch returned without a diagnostic or handoff, an exhausted/non-dispatchable chat could remain `Watching` indefinitely while no new conversation was created. Existing automatic handoff already covered stale Rerun prompts and confirmed prompt-send failures, but not the earlier no-composer state.

## Work completed

### Existing fixes retained

- v0.2.15: watchdog Stop re-arms pending/retry state.
- v0.2.16: normal generation completion immediately refreshes control and chains valid `continue`.
- v0.2.17: normal success clears `sameSequenceRetryCount` immediately without resetting lifetime `Sent` / `runCount`.

### v0.2.18 missing-composer recovery

`content.js` now:

- uses the current composer immediately when available;
- otherwise calls the existing `waitForComposer(5_000)` to allow transient ChatGPT SPA rendering to finish;
- if no composer appears after that short wait, calls the existing `handoffAfterDispatchFailure()` / `HANDOFF_NEW_CHAT` path;
- if handoff succeeds, ownership moves to one fresh ChatGPT tab as before;
- if handoff fails, it safe-stops with `auto_handoff_failed` instead of returning forever or recursively opening more tabs.

No second handoff subsystem was added. Background ownership-transfer logic remains unchanged.

## Regression assertion

`tests/content-send.test.mjs` now requires:

- `findComposer() || await waitForComposer(5_000)` before declaring the current chat unavailable;
- the `!composer` branch to call `handoffAfterDispatchFailure()`;
- failure to fall back to `auto_handoff_failed` safe-stop.

## Validation status

| Check | Result | Note |
|---|---|---|
| v0.2.18 product source | COMMITTED / SOURCE-VERIFIED | Missing-composer branch waits briefly then reuses fresh-chat handoff. |
| v0.2.18 regression assertion | COMMITTED / SOURCE-VERIFIED | Test source pins missing-composer handoff behavior. |
| manifest/package | COMMITTED | version `0.2.18`. |
| exact latest `npm run check` / `npm test` | NOT_RUN | Container could not resolve `raw.githubusercontent.com`; checkout failed before tests could start. |
| live missing-composer handoff | NOT_RUN | Requires extension Reload and browser observation. |
| live new-tab ownership/prompt submission | NOT_RUN | Requires browser observation. |

No browser PASS is claimed.

## Next Exact Action

1. Pull/reload unpacked ChatGPT Rerun **v0.2.18**.
2. Refresh the existing connected ChatGPT tab after the extension reload.
3. Keep the SimpleVTT `work/v1-composite` watcher Watching when its GitHub control is `continue`.
4. Let normal chaining run and confirm `Same-sequence retries` still returns to `0/N` after success.
5. Exercise an exhausted/non-dispatchable current chat where the composer is unavailable.
6. Confirm Rerun waits up to 5 seconds, then opens exactly one new ChatGPT tab and transfers watcher ownership.
7. Confirm the handoff prompt is automatically submitted in the new chat and the old watcher is stopped as handed off.
8. If direct handoff submission cannot complete, confirm it safe-stops instead of opening additional tabs.
9. Record browser evidence before advancing V02-009.

## Do not repeat / regress

- Do not repeat V02-001 through V02-008 without evidence of regression.
- Do not silently return forever on a missing composer while valid `continue` is ready.
- Do not recursively open fresh chats.
- Do not overwrite non-Rerun user drafts.
- Do not reset lifetime `Sent` / `runCount` on normal completion.
- Do not remove abnormal retry protection.
- Do not auto-click GitHub/ChatGPT approval controls.
- Do not treat user manual Stop or watchdog Stop as normal success.
- Do not bypass active GitHub rate-limit pauses.
- Do not merge PR #1 unless explicitly requested.
