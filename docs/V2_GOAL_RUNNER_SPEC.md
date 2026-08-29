# ChatGPT Rerun V2 — Goal Runner Specification

## Purpose

Rerun V2 keeps ChatGPT working toward one user-defined repository goal until the goal is satisfied, human input is required, or repository authority conflicts with the requested goal.

Rerun owns execution continuity. It does not own product planning.

## Core loop

```text
[Goal setup button]
        ↓
Rerun sends goal-authoring prompt
        ↓
User describes the next goal
        ↓
ChatGPT creates rerun-goal-<nonce>.json
        ↓
Extension resolves + validates + stores Goal Contract
        ↓
Frozen executor prompt
        ↓
ChatGPT works + verifies
        ↓
rerun-result-<goal_id>.json
        ├─ CONTINUE   -> same frozen prompt immediately
        ├─ COMPLETE   -> stop
        ├─ NEEDS_USER -> pause
        └─ CONFLICT   -> pause
```

The extension does not parse assistant prose for control state.

## Authority hierarchy

Highest authority first:

1. Current explicit user instruction for the project.
2. Repository-native authoritative instructions, plans, specifications, and selected issue/epic acceptance criteria.
3. The Rerun Goal Contract.
4. Rerun execution mechanics.

If Goal and repository authority conflict, the execution must return `CONFLICT` rather than silently choosing one side.

Rerun V2 does not create or maintain a competing `.chatgpt-rerun/PLAN.md` in target repositories.

## Goal setup protocol

The Side Panel exposes **목표 세우기**.

When pressed, the extension creates a cryptographically random setup nonce and sends a prompt telling ChatGPT to wait for the user's next message. After the user describes the requested outcome, ChatGPT must create one downloadable UTF-8 file named:

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
  "acceptance": [
    "observable completion condition"
  ],
  "authority": [
    "repository-native authoritative path, issue, epic, or specification when known"
  ]
}
```

The extension accepts the file only when:

- `version` and `kind` match V2;
- `setup_nonce` exactly matches the currently pending setup request;
- `goal_id` equals that same nonce;
- repository uses `owner/repo` form;
- goal is non-empty.

This prevents an older goal JSON artifact from silently replacing the current goal.

Goal setup itself must not start implementation or modify the target repository.

## Frozen executor prompt

Once the Goal Contract is accepted, the extension creates one executor prompt and stores it in `chrome.storage.local`.

That exact prompt is reused for every normal iteration of the run. Iteration count and checkpoint do not rewrite the stored frozen prompt.

The one exception is automatic fresh-chat recovery: the first execution dispatched in the transferred chat may append a one-time **Resume Capsule** containing the last verified checkpoint. The stored `frozenPrompt` itself is not mutated, and after that first successfully acknowledged dispatch all later iterations return to the exact frozen prompt.

The prompt contains:

- run ID and goal ID;
- repository and branch;
- goal;
- acceptance criteria;
- known canonical authority sources;
- execution rules requiring repository authority to override the Goal;
- a requirement to avoid repeating verified work and repeated HEAD/history archaeology;
- the result-file contract.

Conversation context and repository evidence carry normal iteration progress. The extension keeps a compact checkpoint for UI and one-time fresh-chat recovery, not to continuously regenerate the executor prompt.

## Result-file protocol

Before finishing each Rerun-owned execution, ChatGPT must create one downloadable UTF-8 file named:

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
  "status": "CONTINUE",
  "checkpoint": "one concise factual resumable checkpoint"
}
```

Allowed statuses:

- `CONTINUE`
- `COMPLETE`
- `NEEDS_USER`
- `CONFLICT`

Every execution must create a fresh result artifact even though the filename is reused. ChatGPT must generate a new `result_id`, write the actual final status for that execution, reopen/verify the newly written JSON, and return the attachment belonging to that newly verified file. A completed execution must contain `"status": "COMPLETE"`; an older attachment with the same filename must never be relinked as the current result.

The extension validates the file structure and active `goal_id`. It keeps the full run-scoped history of processed `result_id` values in addition to attachment identity tracking, so a non-consecutive replay such as `A -> B -> A` is rejected instead of becoming current again. The artifact reader also refuses to re-expose already processed result IDs.

### Result behavior

- `CONTINUE`: store checkpoint and immediately schedule the same frozen executor prompt again.
- `COMPLETE`: stop and show success.
- `NEEDS_USER`: pause for the user.
- `CONFLICT`: pause and require resolution.
- missing or invalid result JSON: treat as interrupted, never success.
- previously processed result ID: ignore it and wait for a genuinely new execution result.

## Generated artifact resolution

A ChatGPT-generated file may be represented in assistant output by a `sandbox:/mnt/data/...` link that is not itself fetchable by an extension content script. Rerun therefore does not treat the visible sandbox URL or a preview DOM as the source of truth for file bytes.

V2.1.7 uses an authenticated artifact resolver:

1. `page-artifact-reader.js` runs in the page `MAIN` world.
2. It reads the logged-in ChatGPT session and obtains the current access token plus the account ID when the session exposes one.
3. It reads the current conversation and finds the message containing the exact expected goal/result filename.
4. It resolves that message's sandbox/message identity through ChatGPT's generated-file download route, with file-ID download routes as fallback.
5. It only accepts final content from ChatGPT/OpenAI generated-file hosts and limits parsed JSON to 1 MiB.
6. `artifact-reader.js` receives the resolved object without receiving the access token, creates a temporary `blob:` URL, and exposes it through a hidden synthetic file node.
7. The existing `content.js` attachment parser consumes that blob and remains the only component that invokes `IMPORT_GOAL_FILE` or `REPORT_RESULT_FILE`.

This preserves one validation/state-transition path: the artifact resolver obtains bytes, while existing V2 normalization still decides whether a goal/result is valid.

For execution results, the extension snapshots matching attachment identities before dispatch and remembers processed `result_id` values for the full run so an older result cannot be accepted as the new execution's response.

Artifact resolution failures are diagnostic only and are stored separately at `v2:artifact:<tabId>`. They do not authorize state transitions. The Side Panel shows an exact `Artifact reader: ...` error instead of silently displaying `Waiting goal JSON` forever.

The Side Panel ensures the normal content script plus both artifact-reader worlds are present on an already-open ChatGPT tab, so reloading the extension does not require a page refresh to restore a pending artifact read.

This is intentionally separate from assistant-message prose parsing.

## Runtime state

V2 state lives in `chrome.storage.local` per ChatGPT tab.

Important fields:

```text
runId
goalId
setupNonce
setupPending
frozenPrompt
status
phase
iteration
lastCheckpoint
lastResult
lastResultId
processedResultIds
lastSentAt
waitingApproval
handoffPending
handoffUsed
handoffFromTabId
handoffToTabId
resumeCapsulePending
```

Repository-side Rerun sequence/control files are not required for normal V2 cadence.

## State machine

```text
IDLE
  -> 목표 세우기
AWAITING_GOAL_FILE
  -> valid goal JSON
READY
  -> submit frozen executor
GENERATING
  -> valid result JSON
     -> CONTINUE -> READY
     -> COMPLETE -> COMPLETE
     -> NEEDS_USER -> PAUSED
     -> CONFLICT -> PAUSED
  -> invalid/missing result -> INTERRUPTED -> READY
```

A trusted manual ChatGPT Stop pauses the goal rather than silently rerunning.

## 20/23 minute behavior

- Executor contract asks ChatGPT to finish/checkpoint within the normal 20-minute execution budget.
- If a Rerun-owned generation remains active for 23 active minutes, the browser watchdog may click ChatGPT Stop once.
- Watchdog Stop is `INTERRUPTED`, not normal success.
- GitHub approval waiting time does not count toward the 23-minute active generation budget.

## GitHub approval

ChatGPT GitHub action confirmation remains a consent boundary.

Rerun may detect a visible GitHub approval card, pause its own loop, and automatically continue after the user manually approves. Rerun must not auto-click, synthesize, hide, or impersonate provider/ChatGPT approval controls.

A future Direct GitHub transport can use credentials explicitly granted to Rerun, but that is a separate authentication path rather than an approval bypass.

## New conversation handoff

If the current conversation loses its composer, Rerun may transfer Goal Runner ownership to **one** fresh ChatGPT tab for that run. The same Goal Contract, frozen prompt, processed-result history, and checkpoint move with the run.

The automatic handoff is run-scoped and single-use. `handoffUsed` is persisted before creating the new tab, so a failed transfer cannot enter a retry loop that opens unlimited tabs. A transferred chat also carries `handoffUsed=true`; if that chat later loses its composer as well, Rerun pauses as `NEEDS_USER` instead of opening another automatic chat.

When a checkpoint exists, the transferred runtime sets `resumeCapsulePending=true`. The first execution claim in the new chat receives the frozen executor prompt plus a one-time Resume Capsule containing `lastCheckpoint`. The capsule is cleared only after the dispatch is acknowledged, so a failed dispatch can retry without losing the checkpoint. Normal iterations after that use the untouched frozen executor prompt again.

## Explicit removals from V1

V2 normal operation removes:

- GitHub `control.json` scheduling;
- Rerun-authored repository PLAN;
- sequence/same-sequence retry semantics as normal cadence;
- `updated_at` authorization;
- GitHub polling as the trigger for each next turn;
- assistant prose parsing as the control protocol;
- full preflight reconciliation every turn.

## V2.1 acceptance

V2.1 JSON protocol is ready for browser validation when:

1. `목표 세우기` sends the setup prompt;
2. the next user-requested goal produces a matching goal JSON artifact;
3. the authenticated artifact resolver obtains the JSON and the existing content protocol imports it;
4. every normal execution reuses the same frozen executor prompt, with only the documented one-time fresh-chat Resume Capsule exception;
5. a newly created result JSON controls CONTINUE / COMPLETE / NEEDS_USER / CONFLICT;
6. old/stale goal and result artifacts, including non-consecutive result-ID replays, are rejected or ignored;
7. assistant prose is not read for control state;
8. GitHub approvals remain manual and do not break the loop;
9. composer exhaustion performs at most one automatic fresh-chat handoff per run and a transferred chat cannot recursively hand off again;
10. the 23-minute watchdog remains recovery-only;
11. an artifact-resolution failure produces a visible diagnostic instead of an unexplained permanent wait.
