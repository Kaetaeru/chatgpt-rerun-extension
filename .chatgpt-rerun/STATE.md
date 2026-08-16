# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.7 fixes fresh-chat auto-resume by decoupling watcher handoff from GitHub work status and retaining v0.2.6 robust auto-submit; reload before browser verification.`
- Phase: `awaiting_v027_reload_and_fresh_chat_probe`
- Last checkpoint (UTC): `2026-08-16T18:01:00Z`
- Current execution started (UTC): `2026-08-16T18:01:00Z`
- Current execution hard stop (UTC): `2026-08-16T18:21:00Z`

## Current Objective

Verify V02-009 on v0.2.7. A normal `continue` dispatch must insert and submit the prompt automatically. `Continue in new chat` must transfer watcher ownership regardless of whether GitHub status is `continue`, `complete`, `needs_user`, or `blocked`. A terminal handoff restores GitHub context without implementation, keeps the new watcher active, and later auto-resumes when GitHub becomes `continue`.

## Regression findings

1. v0.2.5: Start could paste a resume prompt without submitting it.
2. v0.2.6 fixed composer synchronization and submission evidence, but live browser verification was still pending.
3. The user's new-chat report exposed a separate stale rule: `background.js` rejected fresh-chat handoff whenever `control.status !== "continue"`.
4. That rule contradicts the v0.2.4 invariant that Chrome watcher ownership is independent from GitHub work status.

## v0.2.7 fix completed

- Removed the terminal-status handoff rejection from `background.js`.
- Fresh-chat handoff now transfers watcher ownership under all four valid control statuses.
- `buildNewChatHandoffPrompt` now includes run_id, sequence, status, and task_id.
- `continue` handoff tells the new chat to reconcile GitHub and resume the unfinished task.
- `complete` / `needs_user` / `blocked` handoff tells the new chat to restore context only, start no implementation, and leave the watcher polling.
- A later valid `continue` can then auto-resume in the new tab without another Start.
- v0.2.6 robust prompt submission remains shared by `RERUN_HANDOFF`, `RERUN_CONNECT`, and `RERUN_BOOTSTRAP`.
- `tests/watcher-flow.test.mjs` now asserts status-independent handoff.
- New `tests/handoff-status.test.mjs` covers continue vs terminal handoff prompt semantics.
- `docs/TAB_SESSIONS_AND_HANDOFF.md` and `docs/V02_E2E_TEST_PLAN.md` updated to v0.2.7 semantics.
- Extension/package version bumped to `0.2.7`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained; no affected behavior is being re-claimed without new evidence. |
| v0.2.6 auto-submit targeted tests | PASS | 4/4 from previous checkpoint. |
| v0.2.7 remote handoff source inspection | PASS | Current branch no longer contains terminal status handoff gate; ownership transfer and RERUN_HANDOFF remain. |
| v0.2.7 status-aware handoff prompt targeted check | PASS | `continue` resumes; terminal statuses restore context and keep watcher waiting. |
| v0.2.7 committed regression tests | COMMITTED | watcher-flow + handoff-status tests updated/added. |
| v0.2.7 full latest npm suite | NOT_RUN | Container cannot resolve github.com for a full checkout; do not claim full-suite PASS. |
| v0.2.7 browser current-tab auto-submit | NOT_RUN | Requires Reload. |
| v0.2.7 browser new-chat continue handoff | NOT_RUN | Requires Reload. |
| v0.2.7 browser new-chat terminal handoff + later continue | NOT_RUN | Requires Reload. |

## Next Exact Action

Reload the unpacked extension at v0.2.7. Keep the current watcher/control waiting. After Reload confirmation, first verify current-tab auto-submit, then verify `Continue in new chat` under terminal status and a later `continue` auto-resume without another Start.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not call prompt text appearing in the composer a PASS; actual submission is required.
- Do not treat terminal GitHub work status as a reason to block fresh-chat watcher transfer.
- Do not start implementation during a terminal handoff context-recovery prompt.
- Do not merge PR #1 unless the user explicitly requests it.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.7 for live browser verification.
