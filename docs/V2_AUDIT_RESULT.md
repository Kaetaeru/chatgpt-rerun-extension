# ChatGPT Rerun V2.1.6 Audit Result

## Scope

- Branch: `agent/v2-goal-runner`
- Audited HEAD at start: `0f175b3dbb86c39e00c5b5f72a720800f086fec9`
- Canonical authority: `docs/V2_GOAL_RUNNER_SPEC.md`, root `README.md`
- Goal: classify every V2.1 acceptance item with observed evidence and identify specification/implementation conflicts without treating source inspection as browser PASS.

## Verification executed

The execution environment could not `git clone` because outbound DNS for `github.com` was unavailable. To avoid substituting stale local code, the exact HEAD blobs required by the repository's validation scripts were fetched through the authenticated GitHub connector and reconstructed byte-for-byte. Reconstructed file sizes matched GitHub blob sizes for `package.json`, `manifest.json`, the six files in `npm run check`, and all four `tests/v2-*.test.mjs` files.

Actual commands executed against that exact reconstructed snapshot:

```text
npm run check -> PASS
npm test      -> PASS, 22/22 tests
```

The repository tests are primarily unit/source-structure assertions. They are not treated as browser E2E evidence where the README explicitly requires live browser behavior.

## V2.1 acceptance matrix

| # | Acceptance | Status | Evidence |
|---|---|---|---|
| 1 | `목표 세우기` sends setup prompt | PASS | Observed in the active Rerun V2 run: the nonce-bound setup prompt was delivered before goal authoring; source path is `BEGIN_GOAL_SETUP -> buildGoalSetupPrompt -> RERUN_V2_SEND_DIRECT`. |
| 2 | next requested goal produces matching goal JSON | PASS | Observed in the active run: `rerun-goal-dfa25a6d-cd90-47b5-a548-c92b014a9756.json` was generated with matching setup nonce / goal ID and correct repo/branch. `normalizeGoalFile` and tests independently enforce the binding. |
| 3 | authenticated artifact resolver obtains/imports goal JSON | PASS | Observed in the active run: the generated artifact was exposed as a `sandbox:/mnt/data/...` file and the run automatically advanced to the frozen executor. `content.js` explicitly skips raw `sandbox:` URLs, so this transition requires the V2.1.6 artifact bridge/resolver path or an equivalent resolved URL; current source wires MAIN-world resolver -> blob bridge -> existing import protocol. |
| 4 | every execution reuses same frozen executor prompt | PENDING LIVE CONTINUATION | Source/unit evidence passes (`buildExecutorPrompt` identity and stored `runtime.frozenPrompt`). One live `CONTINUE` iteration is being used to verify actual prompt reuse rather than source-only PASS. |
| 5 | new result JSON controls CONTINUE / COMPLETE / NEEDS_USER / CONFLICT | PASS (dynamic runtime harness) | Exact `background.js` was executed with mocked Chrome storage/message APIs. All four statuses reached their specified runtime states. Live `CONTINUE` is additionally being dogfooded by this audit run. |
| 6 | old/stale goal/result artifacts rejected or ignored | **FAIL** | Non-consecutive result replay is accepted. Dynamic reproduction: process result IDs `A -> B`, then submit `A` again with a new attachment/message identity; because runtime stores only `lastResultId`, replayed `A` is accepted and can transition the run to COMPLETE. Goal nonce binding is sound, but processed result IDs are not remembered as required. |
| 7 | assistant prose is not read for control state | PASS (source/unit) | Machine state transitions consume structured goal/result JSON. Existing tests pass and no assistant-text control parser exists. The MAIN-world resolver searches message data only to locate the expected generated filename/artifact identity, not to derive control status. |
| 8 | GitHub approvals stay manual and do not break loop | BLOCKED BROWSER E2E | Source and tests confirm approval-card detection and no approval-button click path. Actual approval-card behavior requires live ChatGPT/GitHub confirmation UI observation. |
| 9 | composer exhaustion performs a single fresh-chat handoff | **FAIL** | Dynamic/source reproduction shows a transferred tab with `handoffFromTabId` is still allowed to call `HANDOFF_NEW_CHAT` again. `handoffToNewChat` guards only `enabled` and `handoffPending`; there is no one-hop/recursion guard. Repeated missing composers can therefore create a chain of fresh tabs. |
| 10 | 23-minute watchdog remains recovery-only | **FAIL** | Approval wait accounting is in content-script memory (`approvalPausedAtMs`, `approvalPausedTotalMs`) rather than persisted runtime state. Dynamic reproduction: reload content during a long manual approval wait, end approval one second later, and the watchdog immediately fires because pre-reload approval-wait time is counted as active generation. This violates the requirement that approval waiting time be excluded. |
| 11 | artifact-resolution failure shows visible diagnostic | BLOCKED BROWSER E2E | Source/unit evidence passes: artifact failures write `v2:artifact:<tabId>` and Side Panel renders `Artifact reader: ...`. A live forced resolver failure/visible panel observation has not yet been performed in this execution environment. |

## Material findings

### Major — processed result IDs are not actually remembered

Specification/README language says previously processed result IDs are ignored. Runtime persists only one `lastResultId`. Attachment-key filtering is content-script memory and is not a durable history. A non-consecutive stale result can therefore be accepted after another result ID has replaced `lastResultId`.

Smallest correction: persist a bounded set/list of processed result IDs per run (and preserve it across handoff/reload), reject any result ID already present, then add a regression test for `A -> B -> A`.

### Major — fresh-chat handoff is not single-hop

A transferred runtime carries `handoffFromTabId`, but the handoff entry guard does not use it. If the new chat also has no composer, it can hand off again indefinitely.

Smallest correction: add a run-scoped one-shot handoff guard (or reject automatic handoff when the active runtime is already a fresh-chat handoff target), then test repeated composer absence after transfer.

### Major — approval wait duration is lost on content-script reload

The watchdog subtracts approval wait only from in-memory timers. `runtime.waitingApproval` survives, but the accumulated/pause-start time does not. Reload during a long approval wait can therefore make the watchdog fire much earlier than 23 active minutes.

Smallest correction: persist approval pause start/accumulated active-time accounting or persist an active-generation elapsed baseline that is restart-safe, then test reload during approval wait.

### Major documentation conflict — V1 control protocol remains presented as current inside the V2 branch

Root `README.md` and `V2_GOAL_RUNNER_SPEC.md` state that V2 normal cadence does not use GitHub `control.json`, sequence/same-sequence scheduling, or a Rerun-authored repository PLAN. The same V2 branch still contains `.chatgpt-rerun/README.md`, `docs/PROJECT_PROTOCOL.md`, `docs/V02_E2E_TEST_PLAN.md`, and related v0.2.x material that describe those V1 mechanisms as mandatory/current. Runtime wiring is V2 (`manifest.json` loads `background.js`; V1 `control.js` is not the normal scheduler), but the repository documentation is internally contradictory and can mislead future executors.

Smallest correction: clearly mark/move the v0.2.x documents as legacy V1 evidence on this branch, or remove them from the V2 branch if the preserved `agent/mvp-autoresume` branch is the intended archive.

## Test coverage gap

The 22 passing tests do not cover the three reproduced failure paths above:

1. non-consecutive result ID replay (`A -> B -> A`);
2. composer absence after a fresh-chat ownership transfer;
3. content-script reload while GitHub approval wait is active.

They should be added as regressions when the product defects are fixed.

## Remaining audit actions

- Consume one live `CONTINUE` result from this audit and compare the next executor prompt to the current frozen prompt (acceptance 4, plus live CONTINUE evidence for acceptance 5).
- Record the result in this document.
- Browser-only acceptance 8 and 11 remain explicitly BLOCKED unless live confirmation UI / forced artifact failure can be observed; they must not be promoted to PASS from source tests alone.
