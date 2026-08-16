# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.12 removes the lifetime Max sends gate that blocked the long-running SimpleVTT watcher; reload and retest the live SimpleVTT tab.`
- Phase: `awaiting_v0212_simplevtt_unlimited_send_probe`
- Last checkpoint (UTC): `2026-08-16T23:25:00Z`

## Current Objective

Verify v0.2.12 against the actual failing project, `Kaetaeru/SimpleVTT` on `main`.

SimpleVTT itself is correctly authorized: sequence 1 / `continue`, with STATE/PLAN requiring further Phase 14 work. The latest no-dispatch behavior was not caused by `Public · rate-safe` and not by a missing GitHub work signal.

## Root cause confirmed

v0.2.11 correctly recognized a newer same-sequence `updated_at` as a fresh authorization, but a separate lifetime counter still ran first:

1. every successful Rerun prompt/handoff increments `runtime.runCount`;
2. default `maxRuns` was 20;
3. normal dispatch returned `wait: max_runs` when `runCount >= maxRuns`;
4. `CLAIM_SEQUENCE` separately rejected with `max_runs`;
5. fresh-chat handoff separately threw `Max sends 한도에 도달했습니다...`;
6. Side Panel could still show `Watching` / `Public · rate-safe`, hiding that dispatch had been suppressed.

SimpleVTT Phase 14 has already used at least twenty deliberate continuation authorizations in the same run, so this lifetime cap matches the observed stop point.

## v0.2.12 implementation

- `background.js`: removed all lifetime send-count gates from normal dispatch, sequence claim, and fresh-chat handoff.
- `control.js`: legacy `maxRuns` normalization now returns `Number.MAX_SAFE_INTEGER` only for compatibility with older stored config/UI code; background execution no longer consults it.
- `popup.html`: removed the visible `Max sends` setting and explains that total sends are unlimited while `Retries / sequence` remains the stuck-control safety guard.
- `runtime.runCount` / Side Panel `Sent`: retained as diagnostic telemetry only.
- `tests/watcher-flow.test.mjs`: now fails if `background.js` regains `max_runs`, `normalizeMaxRuns`, or the old `Max sends` rejection while preserving retry-limit and sequence-regression guards.
- `tests/control.test.mjs`: legacy 0/20/100/999 maxRuns inputs all normalize to the compatibility unbounded sentinel.
- `tests/popup-ui.test.mjs`: asserts the visible Max sends control is gone and the unlimited-send explanation is present.
- manifest/package version bumped to `0.2.12`.
- README contract now explicitly states there is no lifetime send limit.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| SimpleVTT control/STATE/PLAN inspection | PASS | sequence 1 / continue is correctly authorized. |
| SimpleVTT continuation-history inspection | PASS | at least twenty deliberate Phase 14 continuation authorizations exist in the same run. |
| v0.2.11 max-runs root-cause inspection | PASS | lifetime checks occurred before/independent of fresh-generation classification. |
| v0.2.12 source change | COMMITTED | lifetime checks removed from background dispatch/claim/handoff. |
| v0.2.12 regression assertions | COMMITTED | control/watcher/popup tests updated. |
| v0.2.12 exact latest full npm suite | NOT_RUN | container cannot resolve github.com and no mounted exact checkout is available. |
| v0.2.12 SimpleVTT browser dispatch | NOT_RUN | Requires Reload on the user's live SimpleVTT ChatGPT tab. |

## Next Exact Action

Reload unpacked extension v0.2.12. Return to the existing ChatGPT tab connected to `Kaetaeru/SimpleVTT @ main`. Keep/turn the watcher on. Do not change SimpleVTT's run_id or sequence. Expected after the next successful control poll: current sequence 1 / `continue` dispatches even if Side Panel `Sent` is already 20 or higher.

If that conversation is exhausted, the automatic failed-dispatch -> fresh-chat handoff path must also proceed without any lifetime send-count rejection.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not change SimpleVTT sequence merely to bypass local extension counters.
- Do not reintroduce a lifetime Max sends cap; deliberate fresh authorizations must be unlimited.
- Do not remove per-generation retry protection for unchanged/stuck control.
- Do not parse assistant limit-warning text.
- Do not overwrite non-Rerun user drafts.
- Do not recursively open fresh chats after direct handoff failure.
- Do not merge PR #1 unless explicitly requested.
- Do not use STATUS for reconciliation.
