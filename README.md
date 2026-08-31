# ChatGPT Rerun V2

Rerun V2 is a Chrome extension that keeps ChatGPT working toward one repository goal until that goal is complete, needs the user, conflicts with repository authority, or exhausts the worker chats the user allocated.

Current development branch:

```text
agent/v2-goal-runner
```

Current extension version: **2.2.4**.

The previous V1 implementation remains preserved on `agent/mvp-autoresume`.

## V2.2 flow

V2.2 separates **goal authoring** from **goal execution** and preallocates the ChatGPT conversations that may execute the goal.

```text
목표 세우기
   ↓
Goal-authoring chat creates rerun-goal-<nonce>.json
   ↓
Extension validates the Goal Contract
   ↓
Goal-authoring chat stops; it never executes the goal
   ↓
Rerun Worker Pool setup page opens
   ↓
User chooses 1..20 ChatGPT worker chats
   ↓
Rerun opens exactly that many fresh ChatGPT tabs
   ↓
Every worker performs read-only GitHub preflight
   ↓
Each successful worker creates a bound worker-ready JSON
   ↓
Only after every worker is READY does Worker 1 start
   ↓
Worker 1 -> Worker 2 -> ... on conversation exhaustion
```

Rerun does not create another worker tab after execution begins. The selected worker count is the run's conversation budget.

## Why V2 is different

V2 deliberately removes the V1 behavior that made GitHub Rerun bookkeeping compete with the actual project:

- GitHub `control.json` polling is not the execution scheduler.
- Target repositories do not need a Rerun-authored `PLAN.md`.
- There is no normal sequence / same-sequence retry cadence.
- Repository-native plans, specs, issues and acceptance criteria remain authoritative over the Rerun Goal.
- Assistant prose is not used as the machine control protocol.

GitHub remains the project's source of truth, not Rerun's cadence controller.

## Goal setup

The Side Panel entry point remains **목표 세우기**. ChatGPT creates:

```text
rerun-goal-<setup_nonce>.json
```

The Side Panel shows the current nonce as **Goal JSON ID** before import, then shows the accepted `goal_id` after import. This makes it possible to compare the UI directly with the generated filename.

The goal JSON contains repository, branch, goal, acceptance criteria and known canonical authority references and is nonce-bound to the active setup request.

When the extension accepts that JSON, it creates and stores the frozen executor prompt, but **does not send it in the goal-authoring conversation**. Instead it disables that source conversation and opens `pool-setup.html`, where the user chooses how many worker conversations to allocate.

V2.2.4 treats an older same-repository/same-branch pool in `awaiting_worker_count` with zero workers as an abandoned pre-execution setup. A newer Goal JSON automatically marks that unallocated pool `stopped` before import. Pools that have begun provisioning, GitHub preflight, or goal execution remain protected as real conflicts and are never auto-replaced.

## Worker Pool setup

The setup page accepts an integer worker count from **1 to 20**. Rerun then creates all worker ChatGPT tabs and registers all worker runtimes before sending any preflight prompt. This ordering prevents an early worker from becoming READY before the worker list is complete.

The setup page shows each worker as it moves through states such as:

```text
GITHUB PREFLIGHT -> READY -> ACTIVE -> SPENT
```

Only one worker is ACTIVE during goal execution. Unused workers remain READY until needed.

## GitHub preflight and approval

Every worker chat must prove GitHub access before it may execute the goal. Its preflight prompt performs two read-only connected-GitHub actions against the selected repository/branch:

1. read repository metadata;
2. read `README.md`, or the repository root listing when no README is available.

If ChatGPT shows a GitHub approval card in that worker chat, the user should choose the persistent option such as **모든 작업 허용 / Allow all actions / Always allow** for that chat when the UI offers it.

Rerun **does not click, synthesize, hide or impersonate** approval controls. The approval UI remains ChatGPT's consent boundary.

After the GitHub reads actually succeed, the worker creates:

```text
rerun-worker-ready-<goal_id>-<worker_number>-<worker_nonce>.json
```

That file is bound to the run ID, goal ID, worker number, worker nonce, repository and branch. The same authenticated artifact resolver used for goal/result JSON imports it. Assistant prose alone cannot mark a worker READY.

The worker-ready artifact proves that the required GitHub reads succeeded in that conversation. It does **not** attempt to inspect which exact approval button the user selected; persistent approval remains a user choice in ChatGPT.

The goal does not start until every allocated worker has produced a valid worker-ready artifact. Then Worker 1 becomes ACTIVE automatically.

## Goal execution

All workers share one stored **frozen executor prompt**. Within the active worker, normal `CONTINUE` iterations reuse that exact prompt.

Every execution must create a fresh:

```text
rerun-result-<goal_id>.json
```

with a new unique `result_id`, an actual final status (`CONTINUE`, `COMPLETE`, `NEEDS_USER`, or `CONFLICT`), and a concise checkpoint. The result artifact is reopened/verified before it is returned. Previously processed result IDs are retained for the full run, so replay such as `A -> B -> A` is rejected.

## Worker handoff

A worker is treated as conversation-exhausted when ChatGPT exposes a visible maximum-length notice or the run remains `READY` for five seconds without a visible, usable composer.

If maximum-length UI appears while an execution is still `dispatching` or `generating`, Rerun waits for result handling first. It does not switch workers early and lose the just-produced result JSON.

After result handling returns the worker to `READY`, Rerun transfers ownership to the **next already-READY worker tab**. It does not open another ChatGPT tab at handoff time.

The next worker receives:

- the same Goal Contract and untouched frozen executor prompt;
- current iteration count;
- `lastCheckpoint`;
- last result/result ID;
- full processed-result-ID history.

If a checkpoint exists, the first dispatch in the new worker appends a one-time Resume Capsule. Once that dispatch is acknowledged, later turns use the untouched frozen prompt again.

If the final allocated worker is exhausted, the pool changes to `NEEDS_USER`/paused. Rerun does not silently exceed the worker count the user selected.

Legacy non-pool runtimes created by older V2 versions retain the previous single fresh-chat fallback for recovery, but that is not the normal V2.2 path.

## Conversation-end diagnostic

The Side Panel includes **대화길이 끝 테스트** for browser dogfooding before the automatic exhaustion policy is changed again.

V2.2.4 runs a fresh, read-only DOM sampler directly in the currently active ChatGPT tab on every click. The diagnostic recognizes ChatGPT's observed Korean maximum-length banner even when the composer remains usable and the UI still exposes `생각 중` / Stop state. A strong non-authored maximum-length banner takes precedence over stale composer/generation signals; quoted limit text inside normal conversation turns remains excluded.

The diagnostic reports one of three states:

- **대화길이 끝** when it finds a strong non-authored conversation-limit signal or an in-conversation UI telling the user to continue in a new chat;
- **끝이 아님** when ChatGPT is actively generating or a visible usable composer exists without a strong end signal;
- **판단 불가** when the composer is unavailable but the current UI does not expose a known end signal.

The detail area also prints the sampled composer/generation state and up to 16 visible non-authored UI candidates from the conversation area. This is intentionally diagnostic evidence: if ChatGPT changes the end-of-conversation UI again, the browser test reveals the new control text/test IDs instead of silently forcing an incorrect binary result.

The automatic `conversation-limit.js` handoff policy has **not** been changed to trust these new heuristics yet. Browser evidence from an actually exhausted conversation should be captured first, then the automatic policy can be updated against the observed UI.

## Generated artifact resolution

V2.2.4 uses the authenticated ChatGPT artifact resolver for all three structured control artifacts:

- goal JSON;
- worker-ready JSON;
- result JSON.

`page-artifact-reader.js` runs in the page `MAIN` world, obtains the logged-in ChatGPT session context, resolves the exact generated artifact from the current conversation, and hands the parsed object to the isolated artifact reader without exposing the access token to the Goal Runner state machine.

Goal JSON is imported directly by the authenticated artifact reader after validation handoff to the background state machine. The reader uses a revision guard so extension Reloads can replace an older injected reader instead of being blocked by a stale boolean global.

Artifact failures remain diagnostics only and cannot authorize normal goal/result state changes.

## Runtime state

Tab-scoped state remains in:

```text
v2:config:<tabId>
v2:runtime:<tabId>
```

A V2.2 run additionally stores pool orchestration state at:

```text
v2:pool:<runId>
```

Pool state records the source tab, allocation tab, configured worker count, worker tab IDs/statuses, active worker index, frozen prompt, checkpoint, iteration and processed result IDs.

Normal cadence still does not require repository-side Rerun `control.json`.

## GitHub approvals during execution

The preferred path is ChatGPT's own persistent connected-app permission model. If a worker that passed preflight still receives a provider/workspace/safety-required GitHub confirmation card during execution, Rerun pauses its loop and shows `Waiting approval` until the user resolves it. Rerun never bypasses that consent boundary.

## 20 / 23 minute behavior

The executor contract asks ChatGPT to finish/checkpoint within the normal 20-minute execution budget. A 23-active-minute watchdog remains recovery-only. GitHub approval waiting time is intended to be excluded from that active-generation budget.

The requested policy change that continuously reminds the executor to finish before 20 minutes and automatically retries from the last verified JSON/checkpoint after a watchdog Stop is not implemented yet. Conversation-end detection is being validated first.

## Validation

Local validation commands:

```bash
npm run check
npm test
```

V2.2 tests cover, among other existing V2 behavior:

- goal JSON nonce binding;
- authenticated Goal JSON import after extension Reload;
- stale unallocated same-repository pool retirement without touching a running pool;
- goal-authoring chat stopping before execution;
- worker-count setup;
- all worker tabs preallocated before preflight;
- worker-ready JSON binding and authenticated artifact transport;
- no goal execution until all workers are READY;
- premature worker-ready reports rejected during provisioning;
- Worker 1 activation only after full preflight;
- maximum-length result handling before handoff;
- fresh direct conversation-end DOM sampling and Side Panel wiring;
- explicit end UI, continue-in-new-chat UI, usable composer, active generation and ambiguous blank-UI diagnostic cases;
- observed Korean maximum-length banner overriding stale thinking/Stop/composer state;
- handoff to an already-created next worker with no new tab creation;
- checkpoint and processed-result history transfer;
- one-time Resume Capsule;
- stale result replay rejection;
- manual GitHub approval boundary;
- legacy non-pool recovery compatibility.

Browser E2E is still required because ChatGPT's page/composer UI, approval cards and authenticated generated-file endpoints are service implementation details.

## Browser test

1. Reload the unpacked extension from `agent/v2-goal-runner`.
2. Press **목표 세우기** and verify that **Goal JSON ID** immediately shows the setup nonce used in `rerun-goal-<nonce>.json`.
3. After ChatGPT creates that exact Goal JSON, confirm the worker-count setup page opens automatically. An older `awaiting_worker_count` pool with zero workers for the same repository/branch should be marked stopped and must not block the new goal.
4. Open the Side Panel on a normal ChatGPT conversation and press **대화길이 끝 테스트**. Confirm it displays **끝이 아님** when the composer is usable.
5. Open a conversation that has actually reached ChatGPT's current maximum length and press **대화길이 끝 테스트**.
6. On the currently observed Korean UI, the maximum-length banner must make the result **대화길이 끝** even if `composer=true` and `generating=true` still appear in the evidence.
7. If that browser check passes, use the same strong banner signal to update the automatic handoff detector.
8. Then continue the normal Worker Pool browser validation described in `docs/V2_GOAL_RUNNER_SPEC.md`.

See `docs/V2_GOAL_RUNNER_SPEC.md` for the normative protocol.
