# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Final run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension: `0.2.5`
- Status: `PASS`
- Completed at: `2026-08-16T16:05:00Z` (01:05 KST, Aug 17)

## Final validation

| Check | Result | Evidence |
|---|---|---|
| `npm run check` | PASS | Latest v0.2.5 branch source reconstructed from exact GitHub blobs; `node --check` passed for background/content/control/popup. |
| `npm test` | PASS | 38/38 tests passed, 0 failed. |
| Manifest/package JSON parse | PASS | Latest `manifest.json` and `package.json` parsed successfully. |
| Extension version | PASS | manifest/package are `0.2.5`. |

The first full v0.2.5 test run found one **stale regression assertion**, not a product-code failure: `tests/bootstrap-flow.test.mjs` still expected the old `RERUN_HANDOFF || RERUN_BOOTSTRAP` conditional while current `content.js` correctly uses an `includes(...)` direct-prompt set containing `RERUN_HANDOFF`, `RERUN_BOOTSTRAP`, and `RERUN_CONNECT`. The test was updated to the current contract in commit `4fa941663bbc5b35cf8b240c0acd18f95511d4fe`, then the entire suite passed 38/38.

## Browser E2E

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User confirmed two ChatGPT tabs remained separated. |
| V02-002 same-stream collision guard | PASS | Duplicate watcher Start on the same GitHub stream was rejected. |
| V02-003 core dispatch/retry regression | PASS | New-sequence dispatch and same-sequence retry occurred only on the owning tab; other-tab counters remained isolated. |
| V02-004 Continue in new chat | PASS | User confirmed fresh-chat GitHub-backed handoff worked. |
| V02-005 handoff race/failure safeguards | PASS | Live successful handoff plus source-verified `handoffPending` suppression, pre-transfer cleanup, post-transfer `handoff_send_failed`, and terminal refusal without watcher shutdown. |
| V02-006 persistent watcher across terminal GitHub states | PASS | Watcher stayed Watching under `needs_user`; same-sequence `needs_user -> continue` caused automatic resume with no additional Start. |
| V02-007 unified Start/Stop watcher toggle | PASS | User confirmed explicit `Stop -> Stopped/Start -> Start -> Watching/Stop` round trip. |
| V02-008 unconnected-first onboarding | PASS | User reported the complete requested v0.2.5 new-project probe succeeded: true Unconnected start, safe pre-GitHub connection behavior, actual-repo connection flow, Rerun setup, connection confirmation, and Start-driven first-task flow. |

## V02-008 final acceptance

The final v0.2.5 onboarding contract was tested on a separate new-project path. The requested probe covered:

1. a new ChatGPT tab beginning with repository connection `Unconnected` rather than inheriting another tab's coordinates;
2. connection discovery being based on actual current-conversation GitHub usage rather than Side Panel hints;
3. safe no-write behavior before an actual project repository is connected;
4. connection after actual GitHub project use, including installation/repair of `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, and `control.json`;
5. connection turn ending before implementation work;
6. user-confirmable connection coordinates followed by Side Panel Save/Start;
7. watcher-driven first task execution from GitHub control.

The user reported `다 됐어.` after running the requested final sequence. This is the browser acceptance evidence for V02-008.

## Key design evidence retained from the run

- Per-tab config/runtime/draft isolation is browser-verified.
- Same GitHub stream cannot be watched by two tabs at once.
- GitHub work state and Chrome watcher state are independent.
- `complete`, `needs_user`, and `blocked` pause dispatch but do not stop a watcher.
- A later `continue`, including same-sequence terminal -> continue, can auto-resume without a second Start.
- One state-driven watcher control renders Start or Stop from the current tab runtime.
- `Rerun 연결 프롬프트` uses actual conversation GitHub usage and supports `UNCONNECTED`, `AMBIGUOUS`, and `CONNECTED` outcomes.
- The extension does not scrape assistant output to infer repo coordinates or token-limit text.
- New-chat handoff restores from GitHub state rather than copying conversation history.
- Human-readable `.chatgpt-rerun/STATUS.md` remains presentation-only and is not used for reconciliation.

## Completion assessment

All V02-001 through V02-008 acceptance items are verified, latest v0.2.5 syntax checks pass, the complete test suite passes 38/38, JSON validation passes, and no unresolved blocker remains.

**Dogfood result: PASS.**
