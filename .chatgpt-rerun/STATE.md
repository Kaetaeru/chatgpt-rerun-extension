# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.11 fixes same-sequence fresh control generations being blocked by retry_limit; reload and retest the live SimpleVTT watcher.`
- Phase: `awaiting_v0211_simplevtt_same_sequence_probe`
- Last checkpoint (UTC): `2026-08-16T19:05:00Z`

## Current Objective

Verify v0.2.11 against the actual failing project, `Kaetaeru/SimpleVTT` on `main`.

The prior diagnosis that the Rerun extension dogfood control being `needs_user` explained the user's no-dispatch observation was incorrect because the user was testing a different project. Direct inspection of SimpleVTT shows its Rerun stream is valid and currently authorized with sequence 1 / `continue`.

The real extension regression is that v0.2.10 treated all same-sequence continuations as retries solely because `control.sequence === lastHandledSequence`. Long tasks intentionally keep one sequence across multiple ChatGPT executions and republish a newer `control.updated_at` after each durable checkpoint. After two unchanged-sequence sends, the watcher could reach `retry_limit` and then ignore later fresh same-sequence authorizations forever.

## SimpleVTT evidence

- Repository: `Kaetaeru/SimpleVTT`
- Canonical watcher branch: `main`
- run_id: `b7f27a61-29d8-4ba2-9f93-8e66722d5f41`
- sequence: `1`
- status: `continue`
- task_id: `phase14-production-play-session-ux`
- current control updated_at: `2026-08-17T03:51:00+09:00`
- STATE/PLAN both require continuation of the same sequence from the Phase 14 checkpoint.
- Recent repository history contains repeated checkpoint/continue publications while preserving sequence 1, which is an intentional long-task workflow rather than a retry loop.

## v0.2.11 fix completed

- `control.js` now parses existing `lastSentAt` and `control.updatedAt` when the sequence is unchanged.
- If `control.updatedAt > lastSentAt`, the control is treated as a fresh authorization: `send / isRetry=false`.
- Retry count and retry delay apply only when that control generation has not changed since the last send.
- Existing retry protection therefore still prevents an unchanged stuck control from sending indefinitely.
- No new runtime schema field was required; ACK already resets `sameSequenceRetryCount` to zero for a non-retry send.
- `tests/control.test.mjs` now covers rewritten same-sequence authorization after retry count 2 and preserves the unchanged-generation retry-limit assertion.
- Manifest/package bumped to `0.2.11`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| SimpleVTT Rerun control/STATE/PLAN inspection | PASS | sequence 1 / continue is correctly authorized and same-sequence continuation is intentional. |
| v0.2.10 root-cause inspection | PASS | `continuationDisposition()` applied retry limit before considering a newer control generation. |
| v0.2.11 remote source inspection | PASS | same sequence compares `control.updatedAt` against `lastSentAt` before retry-limit logic. |
| v0.2.11 targeted decision probe | PASS | newer same-sequence generation -> fresh send; unchanged generation at retry count 2 -> retry_limit. |
| v0.2.11 regression test update | COMMITTED | `tests/control.test.mjs` covers both paths. |
| v0.2.11 exact latest full npm suite | NOT_RUN | Fresh GitHub checkout cannot be resolved from this runtime; do not claim full-suite PASS. |
| v0.2.11 SimpleVTT browser dispatch | NOT_RUN | Requires extension Reload on the user's live SimpleVTT ChatGPT tab. |

## Next Exact Action

Reload unpacked extension v0.2.11. Return to the existing ChatGPT tab connected to `Kaetaeru/SimpleVTT @ main`. Keep/turn the watcher on. Do not change SimpleVTT's run/sequence merely to wake it. Expected after the next successful control fetch: the current sequence 1 `continue` generation is classified as fresh authorization rather than `retry_limit`, and the resume prompt is automatically submitted.

If that conversation is already exhausted, the existing automatic dispatch-failure -> fresh-chat handoff path should then open exactly one new ChatGPT tab and transfer watcher ownership.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not diagnose the user's SimpleVTT tab from this extension repository's own dogfood control state.
- Do not increment SimpleVTT sequence solely to bypass retry_limit; v0.2.11 must support deliberate repeated control generations within the same sequence.
- Do not remove retry protection for an unchanged control generation.
- Do not parse assistant limit-warning text.
- Do not overwrite non-Rerun user drafts.
- Do not recursively open fresh chats after direct handoff failure.
- Do not merge PR #1 unless explicitly requested.
- Do not use STATUS for reconciliation.
