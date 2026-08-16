# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension: `0.2.4`
- Status: `WAITING_FOR_V02_008`
- Current browser build observed: v0.2.4 persistent tab-watcher UI

## Static / source validation

| Check | Result | Evidence |
|---|---|---|
| Existing v0.2 core baseline | PASS | Earlier live V02-001~004 evidence remains valid. |
| v0.2.1 single-toggle targeted check | PASS | Previously executed against the then-current popup sources. |
| v0.2.2 bootstrap helper targeted check | PASS | Standard-path and bootstrap prompt invariants were checked directly. |
| v0.2.3 connection-prompt source inspection | PASS | Repo-context identification, ambiguity refusal, active-run preservation, five-file setup, control-last, and stop-before-implementation rules are present. |
| v0.2.4 terminal watcher source inspection | PASS | Terminal statuses return `wait` and no longer disable the watcher. |
| v0.2.4 same-sequence terminal -> continue re-arm | PASS | Terminal handling moves `lastHandledSequence` behind the terminal sequence when safe. |
| v0.2.4 watcher UI source inspection | PASS | Side Panel separates `Tab watcher` from `GitHub work status` and keeps one Start/Stop watcher button. |
| v0.2.4 handoff race/failure source inspection | PASS | `handoffPending` suppresses polling; pre-transfer errors clear old pending state; post-transfer prompt failure stops the new tab as `handoff_send_failed`; terminal handoff refusal leaves the existing watcher enabled. |
| Regression test files | COMMITTED | watcher/UI/control regression tests are present in the branch. |
| Full current `npm run check` | NOT_RUN | Current environment still cannot resolve `github.com` to reconstruct the latest checkout. |
| Full current `npm test` | NOT_RUN | Same environment limitation; do not claim the complete latest suite passed. |

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User confirmed two ChatGPT tabs remained separated. |
| V02-002 same-stream collision guard | PASS | User attempted duplicate Start in tab B and confirmed the expected error. |
| V02-003 core dispatch/retry regression | PASS | New-sequence dispatch and same-sequence retry occurred only in owning tab A; tab B counters remained zero. |
| V02-004 Continue in new chat | PASS | User confirmed the fresh-chat GitHub-backed handoff worked. |
| V02-005 handoff race/failure safeguards | PASS | Successful handoff was observed live; source inspection verifies polling suppression and deterministic pre/post-transfer cleanup plus terminal handoff refusal without stopping the watcher. Failure injection that would intentionally break a live ChatGPT handoff was not performed. |
| V02-006 persistent watcher across terminal GitHub states | PASS | With seq 5 / `needs_user`, watcher remained Watching; changing only the same seq 5 to `continue` caused the standard resume prompt to arrive automatically without another Start. |
| V02-007 unified Start/Stop watcher toggle | PASS | User completed the explicit `Stop -> Stopped/Start -> Start -> Watching/Stop` round-trip while GitHub work state remained separate and reported `잘 됐어.` |
| V02-008 explicit Rerun connection prompt onboarding | PARTIAL | Current-project active-run preservation/reconciliation path succeeded; separate-new-project five-file creation path remains unobserved. |

## Latest events

### V02-007 unified watcher toggle PASS

- Time: `2026-08-16T15:20:00Z` (00:20 KST, Aug 17)
- GitHub work state was seq 6 / `needs_user` / V02-007, so no implementation dispatch was expected.
- User performed the requested explicit watcher round-trip: Stop, observe Stopped/Start, then Start, observe Watching/Stop.
- User observation: `잘 됐어.`
- Result: Start/Stop is confirmed to control the Chrome tab watcher independently of GitHub work status. V02-007 PASS.

### V02-005 handoff safeguard acceptance closed

- Time: `2026-08-16T15:20:00Z` (00:20 KST, Aug 17)
- V02-004 already provided live evidence that one fresh-chat ownership transfer works without duplicate prompt/ownership.
- `poll()` returns immediately while `runtime.handoffPending` is true, preventing normal polling during transfer.
- Before ownership transfer, an exception clears the old tab's `handoffPending` flag.
- After ownership transfer, handoff prompt failure disables the new tab with `stopReason=handoff_send_failed`.
- Terminal GitHub work state rejects handoff without disabling the existing watcher.
- This satisfies the PLAN wording "to the extent safely reproducible" without deliberately inducing a destructive live failure. V02-005 PASS.

### V02-006 persistent watcher + same-sequence auto-resume PASS

- Time: `2026-08-16T15:18:00Z` (00:18 KST, Aug 17)
- Before transition, control was seq 5 / `needs_user` and user observed `Tab watcher = Watching`.
- No additional Start was pressed.
- GitHub alone changed to same run / same seq 5 / same task with status `continue`.
- Standard resume prompt arrived automatically in the owning tab.
- Result: terminal work state pauses dispatch but not polling, and same-sequence terminal -> continue auto-resumes.

## Earlier verified evidence

- V02-001: per-tab panel/config/draft/runtime isolation confirmed by user.
- V02-002: duplicate same-stream watcher ownership rejected.
- V02-003: new-sequence dispatch, same-sequence retry, and per-tab counters verified.
- V02-004: fresh-chat handoff succeeded and resumed from GitHub state.
- Current-project `Rerun 연결 프롬프트` was exercised: it identified `Kaetaeru/chatgpt-rerun-extension` / `agent/mvp-autoresume`, found the existing active run, reconciled it as Normal, and preserved run_id/sequence/task/history. This is partial V02-008 evidence only.

## Remaining acceptance gap

V02-008 still needs a **separate safe project** whose ChatGPT conversation already knows its GitHub repository. The unobserved path is:

1. watcher Stopped;
2. click `Rerun 연결 프롬프트`;
3. ChatGPT identifies the correct repo without guessing;
4. it creates/repairs `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, `control.json`;
5. new-project control is published last as sequence 0 / `continue`;
6. connection turn stops before implementation;
7. later Start enables the watcher and begins the first task.

Do not delete or reset an existing real project's Rerun state merely to manufacture this evidence.

## Completion assessment

The v0.2.4 core runtime, watcher semantics, per-tab isolation, retry/dispatch, fresh-chat handoff, and watcher toggle are browser-verified. Formal project DoD is **not yet complete** because V02-008's clean new-project onboarding path has not been exercised and the complete latest Node test suite could not be rerun in this environment.