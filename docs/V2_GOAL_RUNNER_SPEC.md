# ChatGPT Rerun V2 — Goal Runner Specification

## Purpose

Rerun V2 keeps ChatGPT working toward one user-defined repository goal until the goal is satisfied, human input is required, repository authority conflicts with the requested goal, or the user-selected ChatGPT worker pool is exhausted.

Rerun owns execution continuity. It does not own product planning.

V2.2 makes goal authoring and goal execution separate phases. The conversation that creates the Goal Contract is never used as a normal executor worker.

## Authority hierarchy

Highest authority first:

1. Current explicit user instruction for the project.
2. Repository-native authoritative instructions, plans, specifications, and selected issue/epic acceptance criteria.
3. The Rerun Goal Contract.
4. Rerun execution mechanics.

If Goal and repository authority conflict, execution returns `CONFLICT` rather than silently choosing one side.

Rerun V2 does not create or maintain a competing `.chatgpt-rerun/PLAN.md` in target repositories. GitHub repository state is project authority, not the Rerun cadence controller.

## V2.2 core loop

```text
[Goal setup button]
        ↓
Rerun sends goal-authoring prompt
        ↓
User describes the next goal
        ↓
ChatGPT creates rerun-goal-<nonce>.json
        ↓
Extension resolves + validates Goal Contract
        ↓
Goal-authoring chat stops; executor is NOT dispatched there
        ↓
Worker Pool setup page
        ↓
User chooses worker_count (1..20)
        ↓
Rerun creates exactly worker_count ChatGPT tabs
        ↓
All worker runtimes are registered
        ↓
Each worker receives GitHub read-only preflight
        ↓
Each worker creates a bound worker-ready JSON after successful GitHub reads
        ↓
ALL workers READY
        ↓
Worker 1 receives frozen executor prompt
        ↓
result JSON
  ├─ CONTINUE   -> same worker, same frozen prompt
  ├─ COMPLETE   -> pool complete
  ├─ NEEDS_USER -> pool pause
  └─ CONFLICT   -> pool pause
        ↓
conversation exhausted while READY
        ↓
next preapproved worker + one-time Resume Capsule
```

The extension does not parse assistant prose for machine control state.

## Goal setup protocol

The Side Panel exposes **목표 세우기**.

When pressed, the extension creates a cryptographically random setup nonce and sends a prompt telling ChatGPT to wait for the user's next message. After the user describes the requested outcome, ChatGPT creates one downloadable UTF-8 file:

```text
rerun-goal-<setup_nonce>.json
```

Schema:

```json
{
  "version": 2,
  "kind": "chatgpt-rerun-goal",
  "setup_nonce": "uuid",
  "goal_id": "same uuid",
  "repository": "owner/repo",
  "branch": "branch-name",
  "goal": "one clear end-state goal",
  "acceptance": ["observable completion condition"],
  "authority": ["repository-native authoritative path, issue, epic, or specification when known"]
}
```

The extension accepts the file only when version/kind are supported, `setup_nonce` matches the active request, `goal_id` equals the nonce, repository is valid `owner/repo`, and goal is non-empty.

Goal setup itself must not modify the target repository.

### Post-import invariant

After a valid goal JSON is accepted:

- the source/authoring chat is disabled for execution;
- its runtime becomes `pool_setup / awaiting_worker_count`;
- one run ID and one frozen executor prompt are created and persisted;
- `v2:pool:<runId>` is initialized;
- the extension opens `pool-setup.html?runId=<runId>`;
- the frozen executor prompt is **not** sent to the authoring chat.

## Worker Pool allocation

The user chooses an integer worker count from 1 through 20. This number is the maximum number of ChatGPT conversations Rerun may use for the normal V2.2 run.

When allocation starts, the extension must:

1. mark the pool `provisioning`;
2. create exactly N fresh ChatGPT tabs;
3. wait for each tab to load and register its worker runtime/config;
4. assign each worker a zero-based internal index and random worker nonce;
5. persist the complete worker list;
6. change the pool to `awaiting_worker_ready`;
7. only then send GitHub preflight prompts to the workers.

No worker-ready report may be accepted while the pool is still `provisioning`. This prevents an early worker from causing execution to start before all N workers exist.

Rerun does not dynamically add replacement workers after this allocation phase.

## GitHub worker preflight

Every allocated worker must prove that the chat can use the connected GitHub app against the intended repository before the goal may begin.

The preflight prompt must not execute the project goal. It performs only read-only GitHub operations:

1. read repository metadata for the target repository;
2. read `README.md` on the target branch, or the repository root listing if no README is available.

No target-repository write is permitted during worker preflight.

### Approval boundary

If ChatGPT presents a GitHub approval card in a worker chat, Rerun waits. It must not click, synthesize, hide, or impersonate approval controls.

When ChatGPT offers a persistent option such as **Always allow / Allow all actions / 모든 작업 허용**, the user should choose it for that worker so the chat can perform later goal actions without routine reapproval.

Rerun does not claim to inspect which exact permission button was selected. Its machine-verifiable readiness condition is successful GitHub preflight plus the bound worker-ready artifact.

## Worker-ready protocol

After the required GitHub reads succeed, a worker creates:

```text
rerun-worker-ready-<goal_id>-<worker_number>-<worker_nonce>.json
```

`worker_number` is one-based in the file/user-facing protocol.

Schema:

```json
{
  "version": 2,
  "kind": "chatgpt-rerun-worker-ready",
  "run_id": "active run id",
  "goal_id": "active goal id",
  "worker_index": 1,
  "worker_nonce": "worker-specific random nonce",
  "repository": "owner/repo",
  "branch": "branch-name",
  "status": "READY"
}
```

The extension accepts readiness only when all of these match the worker runtime and pool:

- version/kind;
- run ID;
- goal ID;
- one-based worker index;
- worker nonce;
- repository;
- branch;
- literal READY status;
- report comes from the tab registered for that worker;
- pool is already `awaiting_worker_ready`.

The worker-ready JSON travels through the same authenticated generated-artifact resolver as goal/result JSON. Assistant prose cannot mark a worker READY.

When a valid file is consumed, the worker runtime becomes `standby`, `workerReady=true`.

After every readiness report, pool readiness is rebuilt from the persisted runtime of every registered worker rather than trusting a stale in-memory worker list. This makes concurrent/near-concurrent READY reports converge safely.

### Start gate

The project goal must not start until **all N workers are READY**.

When all workers are ready:

- pool status becomes `running`;
- active worker index becomes 0;
- Worker 1 becomes `running / ready`;
- Workers 2..N remain `standby / ready`;
- Worker 1 is focused/woken and receives the executor on the normal content-script tick.

## Frozen executor prompt

The extension creates one executor prompt when the Goal Contract is accepted and stores it in `chrome.storage.local`/pool state.

That exact frozen prompt is reused for all normal iterations and by all workers. Worker count, iteration, checkpoint and worker index do not regenerate the executor prompt.

The single exception is handoff recovery: the first successfully dispatched execution in a successor worker may append a one-time Resume Capsule containing the last verified checkpoint. The stored `frozenPrompt` itself is not mutated.

## Result-file protocol

Before finishing each Rerun-owned executor turn, ChatGPT creates:

```text
rerun-result-<goal_id>.json
```

Schema:

```json
{
  "version": 2,
  "kind": "chatgpt-rerun-result",
  "goal_id": "active goal id",
  "result_id": "new unique id for this execution",
  "status": "CONTINUE|COMPLETE|NEEDS_USER|CONFLICT",
  "checkpoint": "one concise factual resumable checkpoint"
}
```

Every execution must create a fresh artifact despite the reused filename. ChatGPT generates a new result ID, writes the actual final status, reopens/verifies the file, and returns that newly verified attachment. A completed turn must actually contain `"status": "COMPLETE"`.

The extension preserves the complete run-scoped processed-result-ID history. A non-consecutive replay such as `A -> B -> A` is rejected even after worker handoff.

### Result behavior

- `CONTINUE`: persist checkpoint/result history and return the same active worker to `READY`.
- `COMPLETE`: stop the pool successfully.
- `NEEDS_USER`: pause the pool.
- `CONFLICT`: pause the pool for authority resolution.
- invalid/missing result: interrupted recovery, never success.
- previously processed result ID: ignore.

Pool-level checkpoint, iteration and processed-result history mirror the active worker so they can be transferred to the next worker.

## Conversation exhaustion detection

A running worker may be handed off when either of these signals exists:

1. a visible non-authored ChatGPT maximum-conversation-length notice, including supported English/Korean forms; or
2. the worker remains `READY` for five seconds without a visible usable composer, including a composer element that is hidden, disabled, read-only, aria-disabled, or no longer content-editable.

The same warning text inside normal authored user/assistant turns is ignored.

Composer disappearance while `GENERATING` is not by itself exhaustion.

### Result-before-handoff invariant

If a maximum-length notice appears while the worker is `dispatching` or `generating`, the limit detector does **not** hand off immediately. Result JSON processing/interrupted recovery runs first. Handoff may occur only after the worker returns to a non-generating `READY` state.

This prevents a just-produced checkpoint/result from being lost at the conversation boundary.

## Worker handoff

For normal V2.2 pool runs, `HANDOFF_NEW_CHAT` means **advance to the next preallocated READY worker**. It does not create a new tab.

The active worker becomes `handed_off`/spent. The next worker inherits:

- same run ID and goal ID;
- same frozen prompt;
- current iteration;
- `lastCheckpoint`;
- last result/result ID;
- full processed-result-ID history.

The successor receives `resumeCapsulePending=true` when a checkpoint exists. Its first claim appends that checkpoint once; dispatch acknowledgement clears the flag. Later turns use the exact frozen executor prompt.

### Pool exhaustion

If no later READY worker exists:

- no new ChatGPT tab is created;
- current worker becomes `needs_user / paused`;
- pool becomes `needs_user`;
- worker is marked `exhausted`;
- the UI/state records that the preallocated worker budget has been exhausted.

This is intentional: Rerun must not silently exceed the conversation count the user selected.

### Legacy compatibility

A non-pool runtime created by an older V2 version may still use the prior one-shot fresh-chat fallback. That compatibility path is not the normative V2.2 execution path.

## Generated artifact resolution

The authenticated generated-artifact resolver handles:

- `rerun-goal-*.json`;
- `rerun-worker-ready-*.json`;
- `rerun-result-*.json`.

`page-artifact-reader.js` runs in the page `MAIN` world, reads authenticated ChatGPT session/account context, locates the current conversation message containing the exact expected filename, resolves its generated-file identity, and accepts final content only from supported ChatGPT/OpenAI generated-file hosts with a 1 MiB JSON limit.

`artifact-reader.js` bridges the resolved object into the existing isolated content protocol without receiving the access token. `content.js` remains the component that asks background state to import a goal, accept worker readiness, or process a result.

Artifact-resolution failures are diagnostic only at `v2:artifact:<tabId>` and cannot authorize state transitions.

## Runtime and pool state

Per-tab state:

```text
v2:config:<tabId>
v2:runtime:<tabId>
```

Pool state:

```text
v2:pool:<runId>
```

Important worker runtime fields include:

```text
runId
goalId
frozenPrompt
status
phase
iteration
lastCheckpoint
lastResult
lastResultId
processedResultIds
waitingApproval
resumeCapsulePending
poolRunId
workerIndex
workerCount
workerNonce
workerReady
```

Important pool fields include source/allocation tab IDs, worker count/list/statuses, active worker index, config, frozen prompt, iteration, checkpoint, last result and processed-result history.

Repository-side sequence/control files are not required for normal V2 cadence.

## Pool state machine

```text
GOAL_AUTHORING
  -> valid goal JSON
AWAITING_WORKER_COUNT
  -> user selects N
PROVISIONING
  -> all N tabs/runtimes created
AWAITING_WORKER_READY
  -> each bound worker-ready JSON
  -> all N READY
RUNNING(worker 1)
  -> result CONTINUE -> RUNNING(same worker)
  -> conversation exhaustion -> RUNNING(next ready worker)
  -> COMPLETE -> COMPLETE
  -> NEEDS_USER -> PAUSED
  -> CONFLICT -> PAUSED
  -> no next worker -> NEEDS_USER / pool exhausted
```

A trusted manual ChatGPT Stop pauses the active goal rather than silently rerunning.

## 20/23 minute behavior

- Executor contract asks ChatGPT to finish/checkpoint within the normal 20-minute budget.
- A Rerun-owned generation may be stopped as interrupted after 23 active minutes.
- GitHub approval waiting time is intended not to count toward the active generation budget.
- Watchdog recovery is never normal success.

## Explicit removals from V1

V2 normal operation does not use:

- GitHub `control.json` scheduling;
- Rerun-authored repository PLAN;
- sequence/same-sequence retry semantics as normal cadence;
- `updated_at` authorization;
- GitHub polling as the trigger for each next turn;
- assistant prose parsing as the control protocol;
- full V1 preflight reconciliation every turn.

## V2.2 acceptance

V2.2 Worker Pool is ready for browser validation when:

1. `목표 세우기` produces/imports the nonce-bound Goal Contract without starting execution in the authoring chat.
2. successful goal import immediately opens the Worker Pool setup page.
3. the user can select an integer worker count from 1 through 20 and exactly that many ChatGPT worker tabs are created.
4. all worker runtimes are registered and pool status becomes `awaiting_worker_ready` before GitHub preflight prompts are dispatched.
5. each worker performs the required read-only GitHub preflight; approval controls remain manual; only a correctly bound worker-ready JSON marks that worker READY.
6. a premature readiness report while provisioning is rejected, and the goal does not start until every configured worker is READY.
7. after all workers are READY, Worker 1 alone becomes active and receives the same frozen executor used for normal iterations.
8. result JSON freshness, status transitions and full-run stale-result rejection continue to work across worker boundaries.
9. maximum-length or persistent unusable-composer exhaustion waits for active result handling to finish, then transfers to the next already-created READY worker without opening a new ChatGPT tab.
10. successor workers inherit checkpoint/iteration/result history and receive the checkpoint through a one-time Resume Capsule only on their first acknowledged dispatch.
11. exhausting the final allocated worker pauses as `NEEDS_USER` rather than creating an unallocated worker.
12. assistant prose never controls goal readiness, worker readiness, result status or handoff authority.
13. authenticated artifact resolution supports goal, worker-ready and result JSON with visible diagnostics on failure.
14. `npm run check` and `npm test` pass on the V2.2 source snapshot before release claims; browser-only ChatGPT UI/approval behavior is not promoted to PASS without browser E2E.
