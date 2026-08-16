# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.7`
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

## V02-009 regression 1 — prompt inserted but not submitted

The user observed that Start could place the resume prompt in the composer without actually sending it. This is a product failure because automatic dispatch includes both prompt insertion and submission.

v0.2.6 changed `content.js` to synchronize input state, wait longer for Send, use Enter fallback, and require observable dispatch evidence before ACK. Targeted auto-submit tests passed 4/4, but live browser verification remained pending.

## V02-009 regression 2 — new chat did not auto-restart

The user then reported that automatic restart in a new chat was not working. Source inspection found a separate stale architectural rule in `background.js`:

- `Continue in new chat` fetched control and rejected handoff whenever `control.status !== "continue"`.

This conflicted with the v0.2.4 watcher model, where watcher ownership is independent of GitHub work status.

### v0.2.7 fix

- Removed the terminal-status handoff rejection.
- `Continue in new chat` now transfers watcher ownership under `continue`, `complete`, `needs_user`, and `blocked`.
- The handoff prompt now contains owner/repo, branch, control path, run_id, sequence, status, and task_id.
- `continue`: new chat reconciles GitHub and resumes unfinished work.
- terminal status: new chat restores repo/run context only, starts no implementation, and leaves its watcher polling.
- A later valid `continue` is expected to auto-resume in the new chat without another Start.
- v0.2.6 robust direct-prompt submission is used by `RERUN_HANDOFF` as well.

## v0.2.7 validation so far

| Check | Result | Evidence |
|---|---|---|
| Remote `background.js` terminal handoff gate removed | PASS | Current branch proceeds from `fetchControl` to ownership transfer without `status !== continue` rejection. |
| Status-aware handoff prompt | PASS | Targeted local function check: `continue` resumes, terminal restores context/waits. |
| `tests/watcher-flow.test.mjs` updated | COMMITTED | Expects status-independent watcher handoff. |
| `tests/handoff-status.test.mjs` | COMMITTED | Covers continue/needs_user/complete/blocked prompt behavior. |
| v0.2.7 full npm suite | NOT_RUN | Container cannot resolve github.com for a complete branch checkout. |
| Browser current-tab auto-submit | NOT_RUN | Requires v0.2.7 Reload. |
| Browser fresh-chat `continue` handoff | NOT_RUN | Requires v0.2.7 Reload. |
| Browser terminal handoff + later `continue` | NOT_RUN | Requires v0.2.7 Reload. |

## Next browser probe

1. Reload unpacked ChatGPT Rerun v0.2.7.
2. Confirm the connected tab watcher can be Watching while GitHub work state is `needs_user`.
3. Use **Continue in new chat** while status is terminal.
4. Expected: handoff is not rejected; a fresh tab opens; handoff prompt is automatically submitted; context is restored but implementation does not start; new tab watcher remains Watching.
5. Change GitHub to a valid `continue` without pressing Start again.
6. Expected: the new tab automatically submits the standard resume prompt and begins work.
7. Also verify a direct current-tab `continue` dispatch auto-submits rather than merely pasting text.

## Completion assessment

V02-001~008 remain verified. V02-009 is **not yet PASS** until the v0.2.7 browser probes demonstrate actual prompt submission and fresh-chat automatic restart behavior.
